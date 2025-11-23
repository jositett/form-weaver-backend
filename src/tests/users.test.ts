/**
 * User Routes Test Suite
 * Comprehensive tests for user profile management, settings, preferences,
 * and account management endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import usersRoutes from '../src/routes/users';
import { createMiniflareTestEnv } from './setup';

describe('User Routes', () => {
  let app: Hono;
  let mockEnv: any;

  beforeEach(async () => {
    const { mf, env } = await createMiniflareTestEnv();
    mockEnv = env;

    // Create app with user routes
    app = new Hono();
    app.route('/api/users', usersRoutes);
  });

  describe('GET /api/users/profile', () => {
    it('should successfully get user profile', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/user', () => ({
        getUserProfileWithDetails: vi.fn().mockResolvedValue({
          profile: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            avatarUrl: 'https://example.com/avatar.jpg',
            bio: 'Test bio',
            location: 'Test City',
            website: 'https://test.com',
            emailVerified: true,
            preferences: {
              theme: 'dark',
              notifications: {
                email: true,
                browser: true,
                formSubmissions: true,
                workspaceUpdates: true,
              },
              workspaceDefaults: {
                autoSaveForms: true,
              },
              privacy: {
                profileVisibility: 'private',
                activityTracking: true,
              },
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          memberships: [],
          usage: {
            totalFormsCreated: 5,
            totalSubmissionsReceived: 100,
            totalStorageUsed: 50000000,
            activeWorkspaces: 2,
            totalWorkspaces: 3,
            lastActiveAt: Date.now(),
            planLimits: {
              maxForms: 300,
              maxSubmissions: 30000,
              maxStorage: 300 * 1024 * 1024,
              maxWorkspaces: 5,
              maxMembersPerWorkspace: 30,
            },
          },
        }),
      }));

      const response = await app.request('/api/users/profile', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.profile.email).toBe('test@example.com');
      expect(data.data.profile.name).toBe('Test User');
      expect(data.data.profile.preferences).toBeDefined();
    });

    it('should get profile with settings and memberships', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/user', () => ({
        getUserProfileWithDetails: vi.fn().mockResolvedValue({
          profile: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            emailVerified: true,
            preferences: {
              theme: 'system',
              notifications: {
                email: true,
                browser: true,
                formSubmissions: true,
                workspaceUpdates: true,
              },
              workspaceDefaults: {
                autoSaveForms: true,
              },
              privacy: {
                profileVisibility: 'private',
                activityTracking: true,
              },
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          memberships: [
            {
              workspace: {
                id: 'workspace-1',
                name: 'Test Workspace',
                slug: 'test-workspace',
                ownerId: 'test-user-id',
                planType: 'free',
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
              role: 'owner',
              invitedAt: Date.now(),
              joinedAt: Date.now(),
            },
          ],
          usage: {
            totalFormsCreated: 5,
            totalSubmissionsReceived: 100,
            totalStorageUsed: 50000000,
            activeWorkspaces: 1,
            totalWorkspaces: 1,
            lastActiveAt: Date.now(),
            planLimits: {
              maxForms: 100,
              maxSubmissions: 10000,
              maxStorage: 100 * 1024 * 1024,
              maxWorkspaces: 5,
              maxMembersPerWorkspace: 10,
            },
          },
        }),
      }));

      const response = await app.request('/api/users/profile?includeSettings=true&includeMemberships=true&includeUsage=true', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.settings).toBeDefined();
      expect(data.data.memberships).toHaveLength(1);
      expect(data.data.usage).toBeDefined();
    });

    it('should handle non-existent user', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'non-existent-user-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/user', () => ({
        getUserProfileWithDetails: vi.fn().mockResolvedValue(null),
      }));

      const response = await app.request('/api/users/profile', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('User not found');
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should successfully update user profile', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      // Mock rate limiting
      mockEnv.RATE_LIMIT = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ allowed: true }))
        ),
      };

      // Mock database for profile update
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      // Mock audit logging
      vi.doMock('../src/utils/user', () => ({
        updateUserProfile: vi.fn().mockResolvedValue(undefined),
        logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
      }));

      vi.doMock('../src/utils/userValidation', () => ({
        validateAvatarUrl: vi.fn().mockReturnValue(true),
      }));

      vi.doMock('../src/utils/user', () => ({
        getUserProfileWithDetails: vi.fn().mockResolvedValue({
          profile: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Updated Name',
            avatarUrl: 'https://example.com/new-avatar.jpg',
            bio: 'Updated bio',
            emailVerified: true,
            preferences: {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          memberships: [],
          usage: {},
        }),
      }));

      const response = await app.request('/api/users/profile', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          name: 'Updated Name',
          bio: 'Updated bio',
          avatarUrl: 'https://example.com/new-avatar.jpg',
          location: 'New City',
          website: 'https://newwebsite.com',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.profile.name).toBe('Updated Name');
      expect(data.message).toBe('Profile updated successfully');
    });

    it('should reject update when rate limited', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      mockEnv.RATE_LIMIT = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ allowed: false, retryAfter: 3600 }))
        ),
      };

      const response = await app.request('/api/users/profile', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          name: 'Updated Name',
        }),
      });

      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Too many profile updates. Please try again later.');
      expect(data.retryAfter).toBe(3600);
    });

    it('should reject invalid avatar URL', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      mockEnv.RATE_LIMIT = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ allowed: true }))
        ),
      };

      vi.doMock('../src/utils/userValidation', () => ({
        validateAvatarUrl: vi.fn().mockReturnValue(false),
      }));

      const response = await app.request('/api/users/profile', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          name: 'Updated Name',
          avatarUrl: 'invalid-url',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid avatar URL format');
    });
  });

  describe('GET /api/users/profile/settings', () => {
    it('should successfully get user settings', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/user', () => ({
        getUserProfileWithDetails: vi.fn().mockResolvedValue({
          profile: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            avatarUrl: 'https://example.com/avatar.jpg',
            bio: 'Test bio',
            location: 'Test City',
            website: 'https://test.com',
            emailVerified: true,
            preferences: {
              theme: 'dark',
              notifications: {
                email: true,
                browser: true,
                formSubmissions: true,
                workspaceUpdates: true,
              },
              workspaceDefaults: {
                autoSaveForms: true,
              },
              privacy: {
                profileVisibility: 'private',
                activityTracking: true,
              },
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          memberships: [],
          usage: {},
        }),
      }));

      const response = await app.request('/api/users/profile/settings', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.settings.profile.name).toBe('Test User');
      expect(data.data.settings.preferences.theme).toBe('dark');
      expect(data.data.settings.security.emailVerified).toBe(true);
    });
  });

  describe('PUT /api/users/profile/settings', () => {
    it('should successfully update user preferences', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      mockEnv.RATE_LIMIT = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ allowed: true }))
        ),
      };

      vi.doMock('../src/utils/user', () => ({
        updateUserPreferences: vi.fn().mockResolvedValue({
          theme: 'light',
          notifications: {
            email: false,
            browser: true,
            formSubmissions: true,
            workspaceUpdates: true,
          },
          workspaceDefaults: {
            autoSaveForms: true,
          },
          privacy: {
            profileVisibility: 'public',
            activityTracking: true,
          },
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
        logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
      }));

      const response = await app.request('/api/users/profile/settings', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          theme: 'light',
          notifications: {
            email: false,
            browser: true,
            formSubmissions: true,
            workspaceUpdates: true,
          },
          privacy: {
            profileVisibility: 'public',
            activityTracking: true,
          },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.preferences.theme).toBe('light');
      expect(data.message).toBe('Settings updated successfully');
    });
  });

  describe('PUT /api/users/profile/email', () => {
    it('should successfully update user email', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      mockEnv.RATE_LIMIT = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ allowed: true }))
        ),
      };

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'test-user-id',
            email: 'test@example.com',
            password_hash: '$2b$10$hashedpassword',
          }),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      vi.doMock('../src/utils/validation', () => ({
        verifyPassword: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('../src/utils/userValidation', () => ({
        isEmailUnique: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('../src/utils/user', () => ({
        logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
      }));

      vi.doMock('../src/services/emailService', () => ({
        sendProfileChangeNotification: vi.fn().mockResolvedValue(true),
      }));

      const response = await app.request('/api/users/profile/email', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          email: 'newemail@example.com',
          password: 'currentpassword',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Email updated successfully. Please verify your new email address.');
    });

    it('should reject email update with incorrect password', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      mockEnv.RATE_LIMIT = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ allowed: true }))
        ),
      };

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'test-user-id',
            password_hash: '$2b$10$hashedpassword',
          }),
        }),
      });

      vi.doMock('../src/utils/validation', () => ({
        verifyPassword: vi.fn().mockResolvedValue(false),
      }));

      const response = await app.request('/api/users/profile/email', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          email: 'newemail@example.com',
          password: 'wrongpassword',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid current password');
    });

    it('should reject email update with non-unique email', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      mockEnv.RATE_LIMIT = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ allowed: true }))
        ),
      };

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'test-user-id',
            email: 'test@example.com',
            password_hash: '$2b$10$hashedpassword',
          }),
        }),
      });

      vi.doMock('../src/utils/validation', () => ({
        verifyPassword: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('../src/utils/userValidation', () => ({
        isEmailUnique: vi.fn().mockResolvedValue(false),
      }));

      const response = await app.request('/api/users/profile/email', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          email: 'existing@example.com',
          password: 'currentpassword',
        }),
      });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Email address is already in use');
    });
  });

  describe('PUT /api/users/profile/password', () => {
    it('should successfully update user password', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      mockEnv.RATE_LIMIT = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ allowed: true }))
        ),
      };

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'test-user-id',
            password_hash: '$2b$10$hashedpassword',
          }),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      vi.doMock('../src/utils/validation', () => ({
        verifyPassword: vi.fn().mockResolvedValue(true),
        hashPassword: vi.fn().mockResolvedValue('$2b$10$newhashedpassword'),
      }));

      vi.doMock('../src/utils/jwt', () => ({
        deleteRefreshToken: vi.fn().mockResolvedValue(undefined),
      }));

      vi.doMock('../src/utils/user', () => ({
        logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
      }));

      const response = await app.request('/api/users/profile/password', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          currentPassword: 'oldpassword',
          newPassword: 'newpassword123',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Password updated successfully. Please log in again.');
    });

    it('should reject password update with incorrect current password', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      mockEnv.RATE_LIMIT = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ allowed: true }))
        ),
      };

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'test-user-id',
            password_hash: '$2b$10$hashedpassword',
          }),
        }),
      });

      vi.doMock('../src/utils/validation', () => ({
        verifyPassword: vi.fn().mockResolvedValue(false),
      }));

      const response = await app.request('/api/users/profile/password', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid current password');
    });

    it('should reject weak new password', async () => {
      const response = await app.request('/api/users/profile/password', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          currentPassword: 'currentpassword',
          newPassword: '123', // Weak password
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Password');
    });
  });

  describe('PUT /api/users/profile/avatar', () => {
    it('should successfully update user avatar', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      mockEnv.RATE_LIMIT = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ allowed: true }))
        ),
      };

      vi.doMock('../src/utils/user', () => ({
        updateUserProfile: vi.fn().mockResolvedValue(undefined),
        logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
      }));

      vi.doMock('../src/utils/userValidation', () => ({
        validateAvatarUrl: vi.fn().mockReturnValue(true),
      }));

      vi.doMock('../src/utils/user', () => ({
        getUserProfileWithDetails: vi.fn().mockResolvedValue({
          profile: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            avatarUrl: 'https://example.com/new-avatar.jpg',
            emailVerified: true,
            preferences: {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          memberships: [],
          usage: {},
        }),
      }));

      const response = await app.request('/api/users/profile/avatar', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          avatarUrl: 'https://example.com/new-avatar.jpg',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.profile.avatarUrl).toBe('https://example.com/new-avatar.jpg');
      expect(data.message).toBe('Avatar updated successfully');
    });
  });

  describe('GET /api/users/profile/workspaces', () => {
    it('should successfully get user workspace memberships', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/user', () => ({
        getUserProfileWithDetails: vi.fn().mockResolvedValue({
          profile: {},
          memberships: [
            {
              workspace: {
                id: 'workspace-1',
                name: 'Test Workspace 1',
                slug: 'test-workspace-1',
                ownerId: 'test-user-id',
                planType: 'free',
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
              role: 'owner',
              invitedAt: Date.now(),
              joinedAt: Date.now(),
            },
            {
              workspace: {
                id: 'workspace-2',
                name: 'Test Workspace 2',
                slug: 'test-workspace-2',
                ownerId: 'other-user-id',
                planType: 'pro',
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
              role: 'member',
              invitedAt: Date.now(),
              joinedAt: Date.now(),
            },
          ],
          usage: {},
        }),
      }));

      const response = await app.request('/api/users/profile/workspaces', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.memberships).toHaveLength(2);
      expect(data.data.memberships[0].workspace.name).toBe('Test Workspace 1');
      expect(data.data.memberships[0].role).toBe('owner');
    });
  });

  describe('GET /api/users/profile/usage', () => {
    it('should successfully get user usage statistics', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/user', () => ({
        getUserProfileWithDetails: vi.fn().mockResolvedValue({
          profile: {},
          memberships: [],
          usage: {
            totalFormsCreated: 15,
            totalSubmissionsReceived: 500,
            totalStorageUsed: 100000000,
            activeWorkspaces: 3,
            totalWorkspaces: 4,
            lastActiveAt: Date.now(),
            planLimits: {
              maxForms: 400,
              maxSubmissions: 40000,
              maxStorage: 400 * 1024 * 1024,
              maxWorkspaces: 5,
              maxMembersPerWorkspace: 40,
            },
          },
        }),
      }));

      const response = await app.request('/api/users/profile/usage', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.usage.totalFormsCreated).toBe(15);
      expect(data.data.usage.totalSubmissionsReceived).toBe(500);
      expect(data.data.usage.activeWorkspaces).toBe(3);
    });
  });

  describe('DELETE /api/users/profile', () => {
    it('should successfully delete user account', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      mockEnv.RATE_LIMIT = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ allowed: true }))
        ),
      };

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'test-user-id',
            email: 'test@example.com',
            password_hash: '$2b$10$hashedpassword',
          }),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      vi.doMock('../src/utils/validation', () => ({
        verifyPassword: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('../src/utils/user', () => ({
        canDeleteAccount: vi.fn().mockResolvedValue({ canDelete: true }),
        logUserAuditEvent: vi.fn().mockResolvedValue(undefined),
      }));

      vi.doMock('../src/services/emailService', () => ({
        sendProfileChangeNotification: vi.fn().mockResolvedValue(true),
      }));

      const response = await app.request('/api/users/profile', {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          confirmation: 'DELETE',
          password: 'currentpassword',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Account deleted successfully');
    });

    it('should reject account deletion without proper confirmation', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      const response = await app.request('/api/users/profile', {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          confirmation: 'CANCEL', // Wrong confirmation
          password: 'currentpassword',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Confirmation must be "DELETE"');
    });

    it('should reject account deletion when user owns workspaces', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/user', () => ({
        canDeleteAccount: vi.fn().mockResolvedValue({
          canDelete: false,
          reason: 'Cannot delete account while owning workspaces. Transfer ownership or delete workspaces first.',
        }),
      }));

      const response = await app.request('/api/users/profile', {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          confirmation: 'DELETE',
          password: 'currentpassword',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Cannot delete account while owning workspaces. Transfer ownership or delete workspaces first.');
    });

    it('should reject account deletion with incorrect password', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      mockEnv.RATE_LIMIT = {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ allowed: true }))
        ),
      };

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'test-user-id',
            password_hash: '$2b$10$hashedpassword',
          }),
        }),
      });

      vi.doMock('../src/utils/validation', () => ({
        verifyPassword: vi.fn().mockResolvedValue(false),
      }));

      const response = await app.request('/api/users/profile', {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          confirmation: 'DELETE',
          password: 'wrongpassword',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid password');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/user', () => ({
        getUserProfileWithDetails: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      }));

      const response = await app.request('/api/users/profile', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to get user profile');
    });

    it('should handle missing authorization header', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          return c.json({
            success: false,
            error: 'Missing authorization header',
          }, 401);
        }),
      }));

      const response = await app.request('/api/users/profile', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Missing authorization header');
    });
  });
});