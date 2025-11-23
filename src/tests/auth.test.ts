/**
 * Auth Routes Test Suite
 * Comprehensive tests for authentication endpoints including signup, login, 
 * logout, password reset, and email verification flows
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth';
import authRoutes from '../routes/auth';
import { createMiniflareTestEnv, mockDatabase } from './setup';

describe('Auth Routes', () => {
  let app: Hono;
  let mockEnv: any;
  let mockContext: any;

  beforeEach(async () => {
    const { mf, env } = await createMiniflareTestEnv();
    mockEnv = env;
    
    // Mock context for auth middleware
    mockContext = {
      get: vi.fn(),
      set: vi.fn(),
      json: vi.fn(),
      req: {
        raw: {
          headers: new Headers(),
        },
      },
    };

    // Create app with auth routes
    app = new Hono();
    app.route('/api/auth', authRoutes);
  });

  describe('POST /api/auth/signup', () => {
    it('should successfully create a new user account', async () => {
      // Mock database responses
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null), // No existing user
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      mockEnv.DB.batch = vi.fn().mockResolvedValue([{}, {}, {}]);

      // Mock email service
      mockEnv.EMAIL_TOKENS = {
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined),
      };

      const response = await app.request('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.user.email).toBe('test@example.com');
      expect(data.data.user.name).toBe('Test User');
      expect(data.data.workspace).toBeDefined();
      expect(data.data.accessToken).toBeDefined();
      expect(data.data.refreshToken).toBeDefined();
    });

    it('should reject signup with invalid email', async () => {
      const response = await app.request('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'invalid-email',
          password: 'password123',
          name: 'Test User',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid email');
    });

    it('should reject signup with weak password', async () => {
      const response = await app.request('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: '123',
          name: 'Test User',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Password');
    });

    it('should reject signup with existing email', async () => {
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ id: 'existing-user-id' }), // Existing user
        }),
      });

      const response = await app.request('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'password123',
          name: 'Test User',
        }),
      });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('User with this email already exists');
    });

    it('should handle rate limiting for signup', async () => {
      // Mock rate limit exceeded
      mockEnv.RATE_LIMIT = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ allowed: false, retryAfter: 3600 }))
        ),
      };

      const response = await app.request('/api/auth/signup', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-Forwarded-For': '127.0.0.1'
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
          name: 'Test User',
        }),
      });

      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Too many signup attempts. Please try again later.');
      expect(data.retryAfter).toBe(3600);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should successfully authenticate user with valid credentials', async () => {
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'test-user-id',
            email: 'test@example.com',
            password_hash: '$2b$10$hashedpassword', // Mock hashed password
            name: 'Test User',
            email_verified: 1,
            created_at: Date.now(),
            updated_at: Date.now(),
          }),
        }),
      });

      mockEnv.DB.batch = vi.fn().mockReturnValue([
        {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({ workspace_id: 'test-workspace-id' }),
          }),
        },
        {
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockResolvedValue({
              id: 'test-workspace-id',
              name: 'Test Workspace',
              slug: 'test-workspace',
              owner_id: 'test-user-id',
              plan_type: 'free',
              created_at: Date.now(),
              updated_at: Date.now(),
            }),
          }),
        },
      ]);

      const response = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json() as {
        success: boolean;
        data?: {
          user: { email: string; name: string };
          workspace: unknown;
          accessToken: string;
          refreshToken: string;
        };
        error?: string;
        retryAfter?: number;
        message?: string;
      };
      expect(data.success).toBe(true);
      expect(data.data.user.email).toBe('test@example.com');
      expect(data.data.workspace).toBeDefined();
      expect(data.data.accessToken).toBeDefined();
      expect(data.data.refreshToken).toBeDefined();
    });

    it('should reject login with invalid email', async () => {
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null), // User not found
        }),
      });

      const response = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'password123',
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json() as {
        success: boolean;
        data?: {
          user: { email: string; name: string };
          workspace: unknown;
          accessToken: string;
          refreshToken: string;
        };
        error?: string;
        retryAfter?: number;
        message?: string;
      };
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid email or password');
    });

    it('should reject login with invalid password', async () => {
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'test-user-id',
            email: 'test@example.com',
            password_hash: '$2b$10$hashedpassword',
            name: 'Test User',
          }),
        }),
      });

      // Mock password verification to fail
      vi.doMock('../src/utils/validation', () => ({
        verifyPassword: vi.fn().mockResolvedValue(false),
      }));

      const response = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'wrongpassword',
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json() as {
        success: boolean;
        data?: {
          user: { email: string; name: string };
          workspace: unknown;
          accessToken: string;
          refreshToken: string;
        };
        error?: string;
        retryAfter?: number;
        message?: string;
      };
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid email or password');
    });

    it('should reject login with missing credentials', async () => {
      const response = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          // Missing password
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Required');
    });
  });

  describe('POST /api/auth/verify-email', () => {
    it('should successfully verify email with valid token', async () => {
      mockEnv.EMAIL_TOKENS = {
        get: vi.fn().mockResolvedValue(JSON.stringify({
          userId: 'test-user-id',
          email: 'test@example.com',
          createdAt: Date.now(),
        })),
        delete: vi.fn().mockResolvedValue(undefined),
      };

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      const response = await app.request('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-verification-token',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Email verified successfully');
    });

    it('should reject verification with invalid token', async () => {
      mockEnv.EMAIL_TOKENS = {
        get: vi.fn().mockResolvedValue(null), // Token not found
      };

      const response = await app.request('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'invalid-token',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid or expired verification token');
    });

    it('should reject verification with malformed token', async () => {
      const response = await app.request('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: '', // Empty token
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Required');
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('should initiate password reset for existing user', async () => {
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
          }),
        }),
      });

      mockEnv.EMAIL_TOKENS = {
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined),
      };

      const response = await app.request('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('If the email exists, a password reset link has been sent');
    });

    it('should handle password reset confirmation', async () => {
      mockEnv.EMAIL_TOKENS = {
        get: vi.fn().mockResolvedValue(JSON.stringify({
          userId: 'test-user-id',
          email: 'test@example.com',
          createdAt: Date.now(),
        })),
        delete: vi.fn().mockResolvedValue(undefined),
      };

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      const response = await app.request('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-reset-token',
          newPassword: 'newpassword123',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Password reset successfully');
    });

    it('should reject reset confirmation with invalid token', async () => {
      mockEnv.EMAIL_TOKENS = {
        get: vi.fn().mockResolvedValue(null), // Token not found
      };

      const response = await app.request('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'invalid-token',
          newPassword: 'newpassword123',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid or expired reset token');
    });

    it('should reject reset confirmation with weak password', async () => {
      const response = await app.request('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'valid-token',
          newPassword: '123', // Weak password
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Password');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockRejectedValue(new Error('Database connection failed')),
        }),
      });

      const response = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Login failed');
    });

    it('should handle malformed JSON requests', async () => {
      const response = await app.request('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      expect(response.status).toBe(400);
    });
  });
});