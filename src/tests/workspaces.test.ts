/**
 * Workspace Routes Test Suite
 * Comprehensive tests for workspace CRUD operations, member management,
 * and usage statistics endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import workspacesRoutes from '../src/routes/workspaces';
import { createMiniflareTestEnv } from './setup';

describe('Workspace Routes', () => {
  let app: Hono;
  let mockEnv: any;

  beforeEach(async () => {
    const { mf, env } = await createMiniflareTestEnv();
    mockEnv = env;

    // Create app with workspace routes
    app = new Hono();
    app.route('/api/workspaces', workspacesRoutes);
  });

  describe('POST /api/workspaces', () => {
    it('should successfully create a new workspace', async () => {
      // Mock auth middleware
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      // Mock database responses
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 0 }), // No existing workspaces
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      mockEnv.DB.batch = vi.fn().mockResolvedValue([{}, {}, {}]);

      const response = await app.request('/api/workspaces', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          name: 'Test Workspace',
          slug: 'test-workspace',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Test Workspace');
      expect(data.data.slug).toBe('test-workspace');
      expect(data.data.ownerId).toBe('test-user-id');
      expect(data.data.planType).toBe('free');
    });

    it('should reject workspace creation when user has reached limit', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 5 }), // At limit
        }),
      });

      const response = await app.request('/api/workspaces', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          name: 'Test Workspace',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('You have reached the maximum number of workspaces (5)');
    });

    it('should generate unique slug when provided slug exists', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      let callCount = 0;
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockImplementation(() => {
            callCount++;
            if (callCount === 1) return { count: 0 }; // Workspace count check
            if (callCount === 2) return { id: 'existing-workspace' }; // First slug exists
            return null; // Second slug available
          }),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      mockEnv.DB.batch = vi.fn().mockResolvedValue([{}, {}, {}]);

      const response = await app.request('/api/workspaces', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          name: 'Test Workspace',
          slug: 'test-workspace',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.data.slug).toBe('test-workspace-1');
    });

    it('should reject creation without authentication', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          return c.json({
            success: false,
            error: 'Missing authorization header',
          }, 401);
        }),
      }));

      const response = await app.request('/api/workspaces', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Test Workspace',
        }),
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Missing authorization header');
    });
  });

  describe('GET /api/workspaces', () => {
    it('should successfully list user workspaces', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [
              {
                id: 'workspace-1',
                name: 'Test Workspace 1',
                slug: 'test-workspace-1',
                owner_id: 'test-user-id',
                plan_type: 'free',
                created_at: Date.now(),
                updated_at: Date.now(),
                member_count: 1,
              },
              {
                id: 'workspace-2',
                name: 'Test Workspace 2',
                slug: 'test-workspace-2',
                owner_id: 'test-user-id',
                plan_type: 'pro',
                created_at: Date.now(),
                updated_at: Date.now(),
                member_count: 3,
              },
            ],
          }),
        }),
      });

      const response = await app.request('/api/workspaces', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.workspaces).toHaveLength(2);
      expect(data.data.workspaces[0].name).toBe('Test Workspace 1');
      expect(data.data.workspaces[0].memberCount).toBe(1);
      expect(data.data.pagination).toBeDefined();
    });

    it('should handle workspace listing with member inclusion', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [
              {
                id: 'workspace-1',
                name: 'Test Workspace',
                slug: 'test-workspace',
                owner_id: 'test-user-id',
                plan_type: 'free',
                created_at: Date.now(),
                updated_at: Date.now(),
                member_count: 2,
                members: JSON.stringify([
                  {
                    id: 'member-1',
                    userId: 'test-user-id',
                    role: 'owner',
                    invitedAt: Date.now(),
                    joinedAt: Date.now(),
                    user: {
                      id: 'test-user-id',
                      email: 'test@example.com',
                      name: 'Test User',
                    },
                  },
                ]),
              },
            ],
          }),
        }),
      });

      const response = await app.request('/api/workspaces?includeMembers=true', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.workspaces[0].members).toHaveLength(1);
      expect(data.data.workspaces[0].members[0].user.email).toBe('test@example.com');
    });

    it('should handle pagination correctly', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: Array(51).fill(null).map((_, i) => ({
              id: `workspace-${i}`,
              name: `Test Workspace ${i}`,
              slug: `test-workspace-${i}`,
              owner_id: 'test-user-id',
              plan_type: 'free',
              created_at: Date.now(),
              updated_at: Date.now(),
              member_count: 1,
            })),
          }),
        }),
      });

      const response = await app.request('/api/workspaces?limit=50', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.workspaces).toHaveLength(50);
      expect(data.data.pagination.hasNextPage).toBe(true);
      expect(data.data.pagination.nextCursor).toBeDefined();
    });
  });

  describe('GET /api/workspaces/:id', () => {
    it('should successfully get workspace details', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'test-workspace-id',
            name: 'Test Workspace',
            slug: 'test-workspace',
            owner_id: 'test-user-id',
            plan_type: 'free',
            created_at: Date.now(),
            updated_at: Date.now(),
            member_count: 2,
          }),
        }),
      });

      const response = await app.request('/api/workspaces/test-workspace-id', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.name).toBe('Test Workspace');
      expect(data.data.memberCount).toBe(2);
    });

    it('should reject access to non-member workspace', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      // Mock workspace membership check to fail
      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspaceMembership: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({
            success: false,
            error: 'Access denied: not a member of this workspace',
          }), { status: 403 })
        ),
      }));

      const response = await app.request('/api/workspaces/test-workspace-id', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Access denied: not a member of this workspace');
    });
  });

  describe('PUT /api/workspaces/:id', () => {
    it('should successfully update workspace name', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspacePermission: vi.fn().mockResolvedValue({
          userId: 'test-user-id',
          role: 'owner',
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null), // No slug conflict
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      const response = await app.request('/api/workspaces/test-workspace-id', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          name: 'Updated Workspace Name',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Workspace updated successfully');
    });

    it('should reject update for non-owner user', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspacePermission: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({
            success: false,
            error: 'Insufficient permissions for this action',
          }), { status: 403 })
        ),
      }));

      const response = await app.request('/api/workspaces/test-workspace-id', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          name: 'Updated Workspace Name',
        }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Insufficient permissions for this action');
    });

    it('should reject update with duplicate slug', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspacePermission: vi.fn().mockResolvedValue({
          userId: 'test-user-id',
          role: 'owner',
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ id: 'other-workspace' }), // Slug exists
        }),
      });

      const response = await app.request('/api/workspaces/test-workspace-id', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          slug: 'existing-slug',
        }),
      });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Slug is already in use');
    });
  });

  describe('DELETE /api/workspaces/:id', () => {
    it('should successfully delete workspace with no active forms', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspacePermission: vi.fn().mockResolvedValue({
          userId: 'test-user-id',
          role: 'owner',
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 0 }), // No active forms
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      const response = await app.request('/api/workspaces/test-workspace-id', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Workspace deleted successfully');
    });

    it('should reject deletion of workspace with active forms', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspacePermission: vi.fn().mockResolvedValue({
          userId: 'test-user-id',
          role: 'owner',
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 5 }), // Active forms exist
        }),
      });

      const response = await app.request('/api/workspaces/test-workspace-id', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Cannot delete workspace with active forms. Delete all forms first.');
    });
  });

  describe('Workspace Member Management', () => {
    it('should successfully add member to workspace', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspacePermission: vi.fn().mockResolvedValue({
          userId: 'test-user-id',
          role: 'owner',
        }),
        getPlanLimits: vi.fn().mockReturnValue({ maxMembers: 10 }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 1 }), // Current member count
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      const response = await app.request('/api/workspaces/test-workspace-id/members', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          email: 'newmember@example.com',
          role: 'member',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Member added successfully');
    });

    it('should reject adding member to workspace when at member limit', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspacePermission: vi.fn().mockResolvedValue({
          userId: 'test-user-id',
          role: 'owner',
        }),
        getPlanLimits: vi.fn().mockReturnValue({ maxMembers: 2 }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 2 }), // At limit
        }),
      });

      const response = await app.request('/api/workspaces/test-workspace-id/members', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          email: 'newmember@example.com',
          role: 'member',
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Workspace has reached the maximum number of members for the current plan');
    });

    it('should successfully remove member from workspace', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspacePermission: vi.fn().mockResolvedValue({
          userId: 'test-user-id',
          role: 'owner',
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ owner_id: 'test-user-id' }), // Not owner
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      const response = await app.request('/api/workspaces/test-workspace-id/members/test-user-2', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Member removed successfully');
    });

    it('should reject removing workspace owner', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspacePermission: vi.fn().mockResolvedValue({
          userId: 'test-user-id',
          role: 'owner',
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ owner_id: 'test-user-id' }), // Is owner
        }),
      });

      const response = await app.request('/api/workspaces/test-workspace-id/members/test-user-id', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Cannot remove workspace owner');
    });
  });

  describe('GET /api/workspaces/:id/usage', () => {
    it('should successfully get workspace usage statistics', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspaceMembership: vi.fn().mockResolvedValue({
          userId: 'test-user-id',
          role: 'member',
        }),
        getPlanLimits: vi.fn().mockReturnValue({
          maxForms: 10,
          maxSubmissions: 1000,
          maxStorage: 100 * 1024 * 1024,
          maxMembers: 3,
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 5 }), // Forms count
        }),
      });

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 100 }), // Submissions count
        }),
      });

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ total_size: 50000000, file_count: 5 }), // Storage usage
        }),
      });

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 2 }), // Member count
        }),
      });

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ plan_type: 'free' }),
        }),
      });

      const response = await app.request('/api/workspaces/test-workspace-id/usage', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.workspaceId).toBe('test-workspace-id');
      expect(data.data.formCount).toBe(5);
      expect(data.data.submissionCount).toBe(100);
      expect(data.data.storageUsed).toBe(50000000);
      expect(data.data.memberCount).toBe(2);
      expect(data.data.planType).toBe('free');
      expect(data.data.limits).toBeDefined();
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

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockRejectedValue(new Error('Database connection failed')),
        }),
      });

      const response = await app.request('/api/workspaces', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          name: 'Test Workspace',
        }),
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to create workspace');
    });

    it('should handle invalid workspace ID format', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          return next();
        }),
      }));

      const response = await app.request('/api/workspaces/invalid-uuid', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid');
    });
  });
});