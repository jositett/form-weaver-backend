import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { generateTokens, storeRefreshToken, deleteRefreshToken } from '../utils/jwt';
import {
  signupSchema,
  loginSchema,
  emailVerificationSchema,
  resetPasswordSchema,
  resetPasswordConfirmSchema,
  hashPassword,
  verifyPassword,
  SignupInput,
  LoginInput,
  EmailVerificationInput,
  ResetPasswordInput,
  ResetPasswordConfirmInput
} from '../utils/validation';
import type { HonoContext } from '../types/index';

// Generate random ID (simple implementation)
const generateId = (): string => {
  return crypto.randomUUID();
};

// Environment bindings type
type Env = {
  DB: D1Database;
  FORM_CACHE: KVNamespace;
  SESSION_STORE: KVNamespace;
  EMAIL_TOKENS: KVNamespace;
  RATE_LIMIT: KVNamespace;
  JWT_SECRET: string;
  ENVIRONMENT: string;
};

// Create auth router
const auth = new Hono<{
  Bindings: Env;
  Variables: HonoContext;
}>();

/**
 * POST /auth/signup
 * Create a new user account
 */
auth.post(
  '/signup',
  zValidator('json', signupSchema),
  async (c) => {
    const { email, password, name }: SignupInput = c.req.valid('json');

    try {
      // Check if user already exists
      const existingUser = await c.env.DB.prepare(
        'SELECT id FROM users WHERE email = ?'
      )
        .bind(email.toLowerCase())
        .first();

      if (existingUser) {
        return c.json({
          success: false,
          error: 'User with this email already exists',
        }, 409);
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Generate IDs
      const userId = generateId();
      const workspaceId = generateId();
      const now = Date.now();

      // Start transaction by using batch operations
      const batch = [
        // Create user
        c.env.DB.prepare(`
          INSERT INTO users (id, email, password_hash, name, email_verified, created_at, updated_at)
          VALUES (?, ?, ?, ?, 0, ?, ?)
        `)
          .bind(userId, email.toLowerCase(), passwordHash, name, now, now),

        // Create workspace for user (every user gets their own workspace)
        c.env.DB.prepare(`
          INSERT INTO workspaces (id, name, slug, owner_id, plan_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'free', ?, ?)
        `)
          .bind(
            workspaceId,
            `${name}'s Workspace`,
            `${email.split('@')[0]}-workspace`,
            userId,
            now,
            now
          ),

        // Add user as workspace member (owner role)
        c.env.DB.prepare(`
          INSERT INTO workspace_members (id, user_id, workspace_id, role, invited_at, joined_at)
          VALUES (?, ?, ?, 'owner', ?, ?)
        `)
          .bind(generateId(), userId, workspaceId, now, now),
      ];

      // Execute batch
      await c.env.DB.batch(batch);

      // Generate JWT tokens
      const tokens = await generateTokens({
        id: userId,
        email: email.toLowerCase(),
        workspaceId,
        role: 'owner',
      }, c.env.JWT_SECRET);

      // Store refresh token in KV
      await storeRefreshToken(c.env, userId, tokens.refreshToken);

      // Return success response
      return c.json({
        success: true,
        data: {
          user: {
            id: userId,
            email: email.toLowerCase(),
            name,
            emailVerified: false,
            createdAt: now,
            updatedAt: now,
          },
          workspace: {
            id: workspaceId,
            name: `${name}'s Workspace`,
            slug: `${email.split('@')[0]}-workspace`,
            ownerId: userId,
            planType: 'free',
            createdAt: now,
            updatedAt: now,
          },
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
        message: 'Account created successfully',
      }, 201);

    } catch (error) {
      console.error('[Signup Error]', error);

      return c.json({
        success: false,
        error: 'Failed to create account',
      }, 500);
    }
  }
);

/**
 * POST /auth/login
 * Authenticate user and return tokens
 */
auth.post(
  '/login',
  zValidator('json', loginSchema),
  async (c) => {
    const { email, password }: LoginInput = c.req.valid('json');

    try {
      // Find user by email
      const user = await c.env.DB.prepare(
        'SELECT id, email, password_hash, name, email_verified, created_at, updated_at FROM users WHERE email = ?'
      )
        .bind(email.toLowerCase())
        .first();

      if (!user) {
        return c.json({
          success: false,
          error: 'Invalid email or password',
        }, 401);
      }

      // Verify password
      const isValidPassword = await verifyPassword(password, user.password_hash as string);

      if (!isValidPassword) {
        return c.json({
          success: false,
          error: 'Invalid email or password',
        }, 401);
      }

      // Get user's workspace (assume first workspace for now, can be expanded later)
      const workspaceMember = await c.env.DB.prepare(
        'SELECT workspace_id FROM workspace_members WHERE user_id = ? AND role = ? LIMIT 1'
      )
        .bind(user.id, 'owner')
        .first();

      if (!workspaceMember) {
        return c.json({
          success: false,
          error: 'User workspace not found',
        }, 500);
      }

      // Get workspace details
      const workspace = await c.env.DB.prepare(
        'SELECT id, name, slug, owner_id, plan_type, created_at, updated_at FROM workspaces WHERE id = ?'
      )
        .bind(workspaceMember.workspace_id)
        .first();

      if (!workspace) {
        return c.json({
          success: false,
          error: 'User workspace not found',
        }, 500);
      }

      // Generate JWT tokens
      const tokens = await generateTokens({
        id: user.id as string,
        email: user.email as string,
        workspaceId: workspace.id as string,
        role: 'owner',
      }, c.env.JWT_SECRET);

      // Store refresh token in KV
      await storeRefreshToken(c.env, user.id as string, tokens.refreshToken);

      // Return success response
      return c.json({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            emailVerified: Boolean(user.email_verified),
            createdAt: user.created_at,
            updatedAt: user.updated_at,
          },
          workspace: {
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
            ownerId: workspace.owner_id,
            planType: workspace.plan_type,
            createdAt: workspace.created_at,
            updatedAt: workspace.updated_at,
          },
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
        },
        message: 'Login successful',
      });

    } catch (error) {
      console.error('[Login Error]', error);

      return c.json({
        success: false,
        error: 'Login failed',
      }, 500);
    }
  }
);

/**
 * POST /auth/verify-email
 * Send email verification token
 */
auth.post(
  '/verify-email',
  zValidator('json', emailVerificationSchema),
  async (c) => {
    const { token }: EmailVerificationInput = c.req.valid('json');

    try {
      // Verify token from EMAIL_TOKENS KV
      const tokenData = await c.env.EMAIL_TOKENS.get(`verify:${token}`);
      if (!tokenData) {
        return c.json({
          success: false,
          error: 'Invalid or expired verification token',
        }, 400);
      }

      const { userId } = JSON.parse(tokenData);

      // Update user email_verified status
      await c.env.DB.prepare(
        'UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?'
      )
        .bind(Date.now(), userId)
        .run();

      // Delete used token
      await c.env.EMAIL_TOKENS.delete(`verify:${token}`);

      return c.json({
        success: true,
        message: 'Email verified successfully',
      });

    } catch (error) {
      console.error('[Email Verification Error]', error);

      return c.json({
        success: false,
        error: 'Email verification failed',
      }, 500);
    }
  }
);

/**
 * POST /auth/reset-password
 * Initiate or confirm password reset
 */
auth.post(
  '/reset-password',
  zValidator('json', resetPasswordSchema.or(resetPasswordConfirmSchema)),
  async (c) => {
    const body = c.req.valid('json');

    try {
      // Handle password reset initiation
      if ('email' in body) {
        const { email }: ResetPasswordInput = body;

        // Find user by email
        const user = await c.env.DB.prepare(
          'SELECT id, email FROM users WHERE email = ?'
        )
          .bind(email.toLowerCase())
          .first();

        if (!user) {
          // Don't reveal if email exists - return success
          return c.json({
            success: true,
            message: 'If the email exists, a password reset link has been sent',
          });
        }

        // Generate reset token
        const resetToken = crypto.randomUUID();

        // Store token in EMAIL_TOKENS KV with 1 hour expiration
        await c.env.EMAIL_TOKENS.put(
          `reset:${resetToken}`,
          JSON.stringify({
            userId: user.id,
            email: user.email,
            createdAt: Date.now(),
          }),
          {
            expirationTtl: 60 * 60, // 1 hour
          }
        );

        // TODO: Send email with reset link
        // For now, return the token for testing
        console.log(`Password reset token for ${user.email}: ${resetToken}`);

        return c.json({
          success: true,
          message: 'If the email exists, a password reset link has been sent',
        });
      }
      // Handle password reset confirmation
      else {
        const { token, newPassword }: ResetPasswordConfirmInput = body;

        // Verify token from EMAIL_TOKENS KV
        const tokenData = await c.env.EMAIL_TOKENS.get(`reset:${token}`);
        if (!tokenData) {
          return c.json({
            success: false,
            error: 'Invalid or expired reset token',
          }, 400);
        }

        const { userId } = JSON.parse(tokenData);

        // Hash new password
        const newPasswordHash = await hashPassword(newPassword);

        // Update password
        await c.env.DB.prepare(
          'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?'
        )
          .bind(newPasswordHash, Date.now(), userId)
          .run();

        // Delete used token
        await c.env.EMAIL_TOKENS.delete(`reset:${token}`);

        // Invalidate all refresh tokens for security
        await deleteRefreshToken(c.env, userId);

        return c.json({
          success: true,
          message: 'Password reset successfully',
        });
      }

    } catch (error) {
      console.error('[Password Reset Error]', error);

      return c.json({
        success: false,
        error: 'Password reset failed',
      }, 500);
    }
  }
);

export default auth;
