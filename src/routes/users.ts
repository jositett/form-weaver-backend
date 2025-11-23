import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import {
  userProfileUpdateSchema,
  userPreferencesUpdateSchema,
  userEmailUpdateSchema,
  userPasswordUpdateSchema,
  userAvatarUpdateSchema,
  userDeleteSchema,
  userProfileQuerySchema,
  validateAvatarUrl,
  isEmailUnique,
  UserProfileUpdateInput,
  UserPreferencesUpdateInput,
  UserEmailUpdateInput,
  UserPasswordUpdateInput,
  UserAvatarUpdateInput,
  UserDeleteInput,
  UserProfileQuery,
} from '../utils/userValidation';
import {
  getUserProfileWithDetails,
  updateUserProfile,
  updateUserPreferences,
  createUserPreferences,
  logUserAuditEvent,
  canDeleteAccount,
} from '../utils/user';
import {
  checkRateLimit,
  getClientIP,
  PROFILE_UPDATE_RATE_LIMIT,
  EMAIL_CHANGE_RATE_LIMIT,
  PASSWORD_CHANGE_RATE_LIMIT,
  ACCOUNT_DELETION_RATE_LIMIT,
} from '../utils/rateLimit';
import { sendProfileChangeNotification } from '../services/emailService';
import type { Env, HonoContext } from '../types/index';
import type { UserPreferences } from '../types/user';
import { getDb } from '../db/db';

// Create users router
const users = new Hono<{
  Bindings: Env;
  Variables: HonoContext;
}>();

/**
 * GET /api/users/profile - Get current user's profile
 */
users.get(
  '/profile',
  authMiddleware,
  zValidator('query', userProfileQuerySchema),
  async (c) => {
    const query: UserProfileQuery = c.req.valid('query');
    const userId = c.get('userId')!;

    try {
      const profileData = await getUserProfileWithDetails(c.env, userId);
      
      if (!profileData) {
        return c.json({
          success: false,
          error: 'User not found',
        }, 404);
      }

      const response: any = {
        profile: profileData.profile,
      };

      if (query.includeSettings) {
        response.settings = {
          profile: {
            name: profileData.profile.name,
            avatarUrl: profileData.profile.avatarUrl,
            bio: profileData.profile.bio,
            location: profileData.profile.location,
            website: profileData.profile.website,
          },
          preferences: profileData.profile.preferences,
          security: {
            emailVerified: profileData.profile.emailVerified,
            twoFactorEnabled: false, // TODO: Implement 2FA
            passwordUpdatedAt: profileData.profile.updatedAt,
          },
        };
      }

      if (query.includeMemberships) {
        response.memberships = profileData.memberships;
      }

      if (query.includeUsage) {
        response.usage = profileData.usage;
      }

      return c.json({
        success: true,
        data: response,
      });

    } catch (error) {
      console.error('[Get Profile Error]', error);
      return c.json({
        success: false,
        error: 'Failed to get user profile',
      }, 500);
    }
  }
);

/**
 * PUT /api/users/profile - Update user profile
 */
users.put(
  '/profile',
  authMiddleware,
  zValidator('json', userProfileUpdateSchema),
  async (c) => {
    const updates: UserProfileUpdateInput = c.req.valid('json');
    const userId = c.get('userId')!;
    const clientIP = getClientIP(c.req.raw);

    try {
      // Check profile update rate limit
      const profileRateLimit = await checkRateLimit(
        c.env.RATE_LIMIT,
        `profile-update:${userId}`,
        PROFILE_UPDATE_RATE_LIMIT
      );

      if (!profileRateLimit.allowed) {
        return c.json({
          success: false,
          error: 'Too many profile updates. Please try again later.',
          retryAfter: profileRateLimit.retryAfter,
        }, 429);
      }

      // Validate avatar URL if provided
      if (updates.avatarUrl && !validateAvatarUrl(updates.avatarUrl)) {
        return c.json({
          success: false,
          error: 'Invalid avatar URL format',
        }, 400);
      }

      // Update profile
      await updateUserProfile(c.env, userId, updates);

      // Log audit event
      await logUserAuditEvent(
        c.env,
        userId,
        'profile_updated',
        { updates: Object.keys(updates) },
        clientIP,
        c.req.header('User-Agent')
      );

      // Get updated profile
      const profileData = await getUserProfileWithDetails(c.env, userId);

      return c.json({
        success: true,
        data: {
          profile: profileData!.profile,
        },
        message: 'Profile updated successfully',
      });

    } catch (error) {
      console.error('[Update Profile Error]', error);
      return c.json({
        success: false,
        error: 'Failed to update profile',
      }, 500);
    }
  }
);

/**
 * GET /api/users/profile/settings - Get user settings/preferences
 */
users.get(
  '/profile/settings',
  authMiddleware,
  async (c) => {
    const userId = c.get('userId')!;

    try {
      const profileData = await getUserProfileWithDetails(c.env, userId);
      
      if (!profileData) {
        return c.json({
          success: false,
          error: 'User not found',
        }, 404);
      }

      const settings = {
        profile: {
          name: profileData.profile.name,
          avatarUrl: profileData.profile.avatarUrl,
          bio: profileData.profile.bio,
          location: profileData.profile.location,
          website: profileData.profile.website,
        },
        preferences: profileData.profile.preferences,
        security: {
          emailVerified: profileData.profile.emailVerified,
          twoFactorEnabled: false, // TODO: Implement 2FA
          lastLoginAt: profileData.profile.updatedAt, // Simplified for now
          passwordUpdatedAt: profileData.profile.updatedAt,
        },
      };

      return c.json({
        success: true,
        data: { settings },
      });

    } catch (error) {
      console.error('[Get Settings Error]', error);
      return c.json({
        success: false,
        error: 'Failed to get user settings',
      }, 500);
    }
  }
);

/**
 * PUT /api/users/profile/settings - Update user settings/preferences
 */
users.put(
  '/profile/settings',
  authMiddleware,
  zValidator('json', userPreferencesUpdateSchema),
  async (c) => {
    const updates: UserPreferencesUpdateInput = c.req.valid('json');
    const userId = c.get('userId')!;
    const clientIP = getClientIP(c.req.raw);

    try {
      // Check profile update rate limit
      const settingsRateLimit = await checkRateLimit(
        c.env.RATE_LIMIT,
        `settings-update:${userId}`,
        PROFILE_UPDATE_RATE_LIMIT
      );

      if (!settingsRateLimit.allowed) {
        return c.json({
          success: false,
          error: 'Too many settings updates. Please try again later.',
          retryAfter: settingsRateLimit.retryAfter,
        }, 429);
      }

      // Update preferences
      const updatedPreferences = await updateUserPreferences(c.env, userId, updates as Partial<UserPreferences>);

      // Log audit event
      await logUserAuditEvent(
        c.env,
        userId,
        'preferences_updated',
        { updates: Object.keys(updates) },
        clientIP,
        c.req.header('User-Agent')
      );

      return c.json({
        success: true,
        data: {
          preferences: updatedPreferences,
        },
        message: 'Settings updated successfully',
      });

    } catch (error) {
      console.error('[Update Settings Error]', error);
      return c.json({
        success: false,
        error: 'Failed to update settings',
      }, 500);
    }
  }
);

/**
 * PUT /api/users/profile/email - Update user email
 */
users.put(
  '/profile/email',
  authMiddleware,
  zValidator('json', userEmailUpdateSchema),
  async (c) => {
    const { email, password }: UserEmailUpdateInput = c.req.valid('json');
    const userId = c.get('userId')!;
    const clientIP = getClientIP(c.req.raw);

    try {
      // Check email change rate limit
      const emailRateLimit = await checkRateLimit(
        c.env.RATE_LIMIT,
        `email-change:${userId}`,
        EMAIL_CHANGE_RATE_LIMIT
      );

      if (!emailRateLimit.allowed) {
        return c.json({
          success: false,
          error: 'Too many email changes. Please try again later.',
          retryAfter: emailRateLimit.retryAfter,
        }, 429);
      }

      // Verify current password
      const user = await getDb(c.env).prepare(
        'SELECT id, password_hash FROM users WHERE id = ?'
      ).bind(userId).first();

      if (!user) {
        return c.json({
          success: false,
          error: 'User not found',
        }, 404);
      }

      const { verifyPassword } = await import('../utils/validation');
      const isValidPassword = await verifyPassword(password, user.password_hash as string);

      if (!isValidPassword) {
        return c.json({
          success: false,
          error: 'Invalid current password',
        }, 400);
      }

      // Check email uniqueness
      const isUnique = await isEmailUnique(c.env, email, userId);
      if (!isUnique) {
        return c.json({
          success: false,
          error: 'Email address is already in use',
        }, 409);
      }

      // Update email
      const now = Date.now();
      await getDb(c.env).prepare(
        'UPDATE users SET email = ?, email_verified = 0, updated_at = ? WHERE id = ?'
      ).bind(email.toLowerCase(), now, userId).run();

      // Log audit event
      await logUserAuditEvent(
        c.env,
        userId,
        'email_changed',
        { oldEmail: user.email, newEmail: email },
        clientIP,
        c.req.header('User-Agent')
      );

      // Send notification email
      await sendProfileChangeNotification(
        c.env,
        email.toLowerCase(),
        userId,
        'email_changed',
        { oldEmail: user.email as string }
      );

      return c.json({
        success: true,
        message: 'Email updated successfully. Please verify your new email address.',
      });

    } catch (error) {
      console.error('[Update Email Error]', error);
      return c.json({
        success: false,
        error: 'Failed to update email',
      }, 500);
    }
  }
);

/**
 * PUT /api/users/profile/password - Update user password
 */
users.put(
  '/profile/password',
  authMiddleware,
  zValidator('json', userPasswordUpdateSchema),
  async (c) => {
    const { currentPassword, newPassword }: UserPasswordUpdateInput = c.req.valid('json');
    const userId = c.get('userId')!;
    const clientIP = getClientIP(c.req.raw);

    try {
      // Check password change rate limit
      const passwordRateLimit = await checkRateLimit(
        c.env.RATE_LIMIT,
        `password-change:${userId}`,
        PASSWORD_CHANGE_RATE_LIMIT
      );

      if (!passwordRateLimit.allowed) {
        return c.json({
          success: false,
          error: 'Too many password changes. Please try again later.',
          retryAfter: passwordRateLimit.retryAfter,
        }, 429);
      }

      // Verify current password
      const user = await getDb(c.env).prepare(
        'SELECT id, password_hash FROM users WHERE id = ?'
      ).bind(userId).first();

      if (!user) {
        return c.json({
          success: false,
          error: 'User not found',
        }, 404);
      }

      const { verifyPassword, hashPassword } = await import('../utils/validation');
      const isValidPassword = await verifyPassword(currentPassword, user.password_hash as string);

      if (!isValidPassword) {
        return c.json({
          success: false,
          error: 'Invalid current password',
        }, 400);
      }

      // Hash new password
      const newPasswordHash = await hashPassword(newPassword);

      // Update password
      const now = Date.now();
      await getDb(c.env).prepare(
        'UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?'
      ).bind(newPasswordHash, now, userId).run();

      // Invalidate all refresh tokens for security
      const { deleteRefreshToken } = await import('../utils/jwt');
      await deleteRefreshToken(c.env, userId);

      // Log audit event
      await logUserAuditEvent(
        c.env,
        userId,
        'password_changed',
        {},
        clientIP,
        c.req.header('User-Agent')
      );

      return c.json({
        success: true,
        message: 'Password updated successfully. Please log in again.',
      });

    } catch (error) {
      console.error('[Update Password Error]', error);
      return c.json({
        success: false,
        error: 'Failed to update password',
      }, 500);
    }
  }
);

/**
 * PUT /api/users/profile/avatar - Update user avatar
 */
users.put(
  '/profile/avatar',
  authMiddleware,
  zValidator('json', userAvatarUpdateSchema),
  async (c) => {
    const { avatarUrl }: UserAvatarUpdateInput = c.req.valid('json');
    const userId = c.get('userId')!;
    const clientIP = getClientIP(c.req.raw);

    try {
      // Check profile update rate limit
      const avatarRateLimit = await checkRateLimit(
        c.env.RATE_LIMIT,
        `avatar-update:${userId}`,
        PROFILE_UPDATE_RATE_LIMIT
      );

      if (!avatarRateLimit.allowed) {
        return c.json({
          success: false,
          error: 'Too many avatar updates. Please try again later.',
          retryAfter: avatarRateLimit.retryAfter,
        }, 429);
      }

      // Validate avatar URL
      if (avatarUrl && !validateAvatarUrl(avatarUrl)) {
        return c.json({
          success: false,
          error: 'Invalid avatar URL format',
        }, 400);
      }

      // Update avatar
      await updateUserProfile(c.env, userId, { avatarUrl });

      // Log audit event
      await logUserAuditEvent(
        c.env,
        userId,
        'avatar_updated',
        { avatarUrl: avatarUrl || null },
        clientIP,
        c.req.header('User-Agent')
      );

      // Get updated profile
      const profileData = await getUserProfileWithDetails(c.env, userId);

      return c.json({
        success: true,
        data: {
          profile: {
            avatarUrl: profileData!.profile.avatarUrl,
          },
        },
        message: 'Avatar updated successfully',
      });

    } catch (error) {
      console.error('[Update Avatar Error]', error);
      return c.json({
        success: false,
        error: 'Failed to update avatar',
      }, 500);
    }
  }
);

/**
 * GET /api/users/profile/workspaces - Get user's workspace memberships
 */
users.get(
  '/profile/workspaces',
  authMiddleware,
  async (c) => {
    const userId = c.get('userId')!;

    try {
      const profileData = await getUserProfileWithDetails(c.env, userId);
      
      if (!profileData) {
        return c.json({
          success: false,
          error: 'User not found',
        }, 404);
      }

      return c.json({
        success: true,
        data: {
          memberships: profileData.memberships,
        },
      });

    } catch (error) {
      console.error('[Get Workspaces Error]', error);
      return c.json({
        success: false,
        error: 'Failed to get workspace memberships',
      }, 500);
    }
  }
);

/**
 * GET /api/users/profile/usage - Get user's usage statistics
 */
users.get(
  '/profile/usage',
  authMiddleware,
  async (c) => {
    const userId = c.get('userId')!;

    try {
      const profileData = await getUserProfileWithDetails(c.env, userId);
      
      if (!profileData) {
        return c.json({
          success: false,
          error: 'User not found',
        }, 404);
      }

      return c.json({
        success: true,
        data: {
          usage: profileData.usage,
        },
      });

    } catch (error) {
      console.error('[Get Usage Error]', error);
      return c.json({
        success: false,
        error: 'Failed to get usage statistics',
      }, 500);
    }
  }
);

/**
 * DELETE /api/users/profile - Delete user account
 */
users.delete(
  '/profile',
  authMiddleware,
  zValidator('json', userDeleteSchema),
  async (c) => {
    const { confirmation, password }: UserDeleteInput = c.req.valid('json');
    const userId = c.get('userId')!;
    const clientIP = getClientIP(c.req.raw);

    try {
      // Check account deletion rate limit
      const deletionRateLimit = await checkRateLimit(
        c.env.RATE_LIMIT,
        `account-deletion:${userId}`,
        ACCOUNT_DELETION_RATE_LIMIT
      );

      if (!deletionRateLimit.allowed) {
        return c.json({
          success: false,
          error: 'Account deletion limit exceeded. Please try again later.',
          retryAfter: deletionRateLimit.retryAfter,
        }, 429);
      }

      // Verify confirmation
      if (confirmation !== 'DELETE') {
        return c.json({
          success: false,
          error: 'Confirmation must be "DELETE"',
        }, 400);
      }

      // Verify current password
      const user = await getDb(c.env).prepare(
        'SELECT id, email, password_hash FROM users WHERE id = ?'
      ).bind(userId).first();

      if (!user) {
        return c.json({
          success: false,
          error: 'User not found',
        }, 404);
      }

      const { verifyPassword } = await import('../utils/validation');
      const isValidPassword = await verifyPassword(password, user.password_hash as string);

      if (!isValidPassword) {
        return c.json({
          success: false,
          error: 'Invalid password',
        }, 400);
      }

      // Check if user can delete account
      const canDelete = await canDeleteAccount(c.env, userId);
      if (!canDelete.canDelete) {
        return c.json({
          success: false,
          error: canDelete.reason,
        }, 400);
      }

      // Soft delete user (mark as deleted)
      const now = Date.now();
      await getDb(c.env).prepare(
        'UPDATE users SET email = ?, password_hash = ?, name = ?, bio = ?, location = ?, website = ?, updated_at = ? WHERE id = ?'
      ).bind(
        `deleted_${now}_${user.email}`,
        'deleted', // Hashed deleted marker
        'Deleted User',
        null,
        null,
        null,
        now,
        userId
      ).run();

      // Log audit event
      await logUserAuditEvent(
        c.env,
        userId,
        'account_deleted',
        { email: user.email },
        clientIP,
        c.req.header('User-Agent')
      );

      // Send notification email
      await sendProfileChangeNotification(
        c.env,
        user.email as string,
        userId,
        'account_deleted',
        {}
      );

      return c.json({
        success: true,
        message: 'Account deleted successfully',
      });

    } catch (error) {
      console.error('[Delete Account Error]', error);
      return c.json({
        success: false,
        error: 'Failed to delete account',
      }, 500);
    }
  }
);

export default users;