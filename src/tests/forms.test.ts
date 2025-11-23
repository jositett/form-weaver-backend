/**
 * Forms Routes Test Suite
 * Comprehensive tests for form lifecycle management, submissions,
 * version management, and analytics endpoints
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import formsRoutes from '../src/routes/forms';
import { createMiniflareTestEnv } from './setup';

describe('Forms Routes', () => {
  let app: Hono;
  let mockEnv: any;

  beforeEach(async () => {
    const { mf, env } = await createMiniflareTestEnv();
    mockEnv = env;

    // Create app with form routes
    app = new Hono();
    app.route('/api/forms', formsRoutes);
  });

  describe('POST /api/forms', () => {
    it('should successfully create a new form', async () => {
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
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      const formSchema = {
        title: 'Test Form',
        description: 'A test form',
        fields: [
          {
            id: 'field-1',
            type: 'text',
            label: 'Name',
            required: true,
          },
        ],
      };

      const response = await app.request('/api/forms', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          title: 'Test Form',
          description: 'A test form for testing',
          schema: formSchema,
          status: 'draft',
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.title).toBe('Test Form');
      expect(data.data.description).toBe('A test form for testing');
      expect(data.data.schema).toEqual(formSchema);
      expect(data.data.status).toBe('draft');
      expect(data.data.version).toBe(1);
      expect(data.data.createdBy).toBe('test-user-id');
      expect(data.message).toBe('Form created successfully');
    });

    it('should reject form creation without workspace membership', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspaceMembership: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({
            success: false,
            error: 'Access denied: not a member of this workspace',
          }), { status: 403 })
        ),
      }));

      const response = await app.request('/api/forms', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          title: 'Test Form',
          schema: {},
        }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Access denied: not a member of this workspace');
    });

    it('should reject form creation with invalid schema', async () => {
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
      }));

      const response = await app.request('/api/forms', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          title: '', // Invalid title
          status: 'invalid-status', // Invalid status
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Required');
    });

    it('should create form with default status as draft', async () => {
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
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      const response = await app.request('/api/forms', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          title: 'Test Form',
          schema: {},
          // No status provided - should default to draft
        }),
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.status).toBe('draft');
    });
  });

  describe('GET /api/forms', () => {
    it('should successfully list forms with pagination', async () => {
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
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [
              {
                id: 'form-1',
                workspace_id: 'test-workspace-id',
                title: 'Test Form 1',
                description: 'First test form',
                form_schema: JSON.stringify({ fields: [] }),
                status: 'published',
                version: 2,
                created_by: 'test-user-id',
                created_at: Date.now() - 86400000, // Yesterday
                updated_at: Date.now() - 43200000, // 12 hours ago
              },
              {
                id: 'form-2',
                workspace_id: 'test-workspace-id',
                title: 'Test Form 2',
                description: 'Second test form',
                form_schema: JSON.stringify({ fields: [] }),
                status: 'draft',
                version: 1,
                created_by: 'test-user-id',
                created_at: Date.now(),
                updated_at: Date.now(),
              },
            ],
          }),
        }),
      });

      const response = await app.request('/api/forms?limit=10', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.forms).toHaveLength(2);
      expect(data.data.forms[0].title).toBe('Test Form 1');
      expect(data.data.forms[0].status).toBe('published');
      expect(data.data.forms[1].status).toBe('draft');
      expect(data.data.pagination).toBeDefined();
      expect(data.data.pagination.hasNextPage).toBe(false);
    });

    it('should filter forms by status', async () => {
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
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [
              {
                id: 'form-1',
                workspace_id: 'test-workspace-id',
                title: 'Published Form',
                description: 'Published test form',
                form_schema: JSON.stringify({ fields: [] }),
                status: 'published',
                version: 1,
                created_by: 'test-user-id',
                created_at: Date.now(),
                updated_at: Date.now(),
              },
            ],
          }),
        }),
      });

      const response = await app.request('/api/forms?status=published', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.forms).toHaveLength(1);
      expect(data.data.forms[0].status).toBe('published');
    });

    it('should search forms by title and description', async () => {
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
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [
              {
                id: 'form-1',
                workspace_id: 'test-workspace-id',
                title: 'Contact Form',
                description: 'Get in touch with us',
                form_schema: JSON.stringify({ fields: [] }),
                status: 'published',
                version: 1,
                created_by: 'test-user-id',
                created_at: Date.now(),
                updated_at: Date.now(),
              },
            ],
          }),
        }),
      });

      const response = await app.request('/api/forms?search=contact', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.forms).toHaveLength(1);
      expect(data.data.forms[0].title).toBe('Contact Form');
    });

    it('should handle cursor-based pagination', async () => {
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
      }));

      const mockTimestamp = Date.now();
      const mockCursor = btoa(`${mockTimestamp}|form-50`);

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          all: vi.fn().mockResolvedValue({
            results: [
              {
                id: 'form-51',
                workspace_id: 'test-workspace-id',
                title: 'Form 51',
                description: 'Test form',
                form_schema: JSON.stringify({ fields: [] }),
                status: 'draft',
                version: 1,
                created_by: 'test-user-id',
                created_at: mockTimestamp + 1,
                updated_at: mockTimestamp + 1,
              },
              // Plus one extra to indicate next page
              {
                id: 'form-52',
                workspace_id: 'test-workspace-id',
                title: 'Form 52',
                description: 'Test form',
                form_schema: JSON.stringify({ fields: [] }),
                status: 'draft',
                version: 1,
                created_by: 'test-user-id',
                created_at: mockTimestamp + 2,
                updated_at: mockTimestamp + 2,
              },
            ],
          }),
        }),
      });

      const response = await app.request(`/api/forms?limit=1&cursor=${mockCursor}`, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.forms).toHaveLength(1);
      expect(data.data.forms[0].id).toBe('form-51');
      expect(data.data.pagination.hasNextPage).toBe(true);
      expect(data.data.pagination.nextCursor).toBeDefined();
    });
  });

  describe('GET /api/forms/:id', () => {
    it('should successfully get form details', async () => {
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
      }));

      mockEnv.FORM_CACHE = {
        get: vi.fn().mockResolvedValue(null), // No cache hit
        put: vi.fn().mockResolvedValue(undefined),
      };

      const formSchema = {
        title: 'Test Form',
        fields: [
          {
            id: 'field-1',
            type: 'text',
            label: 'Name',
            required: true,
          },
        ],
      };

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'test-form-id',
            workspace_id: 'test-workspace-id',
            title: 'Test Form',
            description: 'A test form',
            form_schema: JSON.stringify(formSchema),
            status: 'published',
            version: 2,
            created_by: 'test-user-id',
            created_at: Date.now() - 86400000,
            updated_at: Date.now() - 43200000,
          }),
        }),
      });

      const response = await app.request('/api/forms/test-form-id', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('test-form-id');
      expect(data.data.title).toBe('Test Form');
      expect(data.data.schema).toEqual(formSchema);
      expect(data.data.status).toBe('published');
      expect(data.data.version).toBe(2);
      expect(data.cached).toBe(false);
    });

    it('should return cached form for published forms', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      const cachedFormData = {
        id: 'test-form-id',
        workspaceId: 'test-workspace-id',
        title: 'Test Form',
        status: 'published',
        version: 1,
      };

      mockEnv.FORM_CACHE = {
        get: vi.fn().mockResolvedValue(JSON.stringify(cachedFormData)),
        put: vi.fn().mockResolvedValue(undefined),
      };

      const response = await app.request('/api/forms/test-form-id', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data).toEqual(cachedFormData);
      expect(data.cached).toBe(true);
    });

    it('should reject access to non-existent form', async () => {
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
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null), // Form not found
        }),
      });

      const response = await app.request('/api/forms/non-existent-form', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Form not found');
    });

    it('should reject access to form in different workspace', async () => {
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
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'test-form-id',
            workspace_id: 'different-workspace-id', // Different workspace
            title: 'Test Form',
            description: 'A test form',
            form_schema: JSON.stringify({}),
            status: 'published',
            version: 1,
            created_by: 'test-user-id',
            created_at: Date.now(),
            updated_at: Date.now(),
          }),
        }),
      });

      const response = await app.request('/api/forms/test-form-id', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Form not found');
    });
  });

  describe('PUT /api/forms/:id', () => {
    it('should successfully update form', async () => {
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
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            title: 'Old Title',
            description: 'Old description',
            form_schema: JSON.stringify({ fields: [] }),
            status: 'draft',
            version: 1,
          }),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      vi.doMock('../src/utils/formVersions', () => ({
        autoCreateVersionOnUpdate: vi.fn().mockResolvedValue(undefined),
      }));

      const response = await app.request('/api/forms/test-form-id', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          title: 'Updated Title',
          description: 'Updated description',
          status: 'published',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Form updated successfully');
    });

    it('should increment version on form update', async () => {
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
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            title: 'Old Title',
            description: 'Old description',
            form_schema: JSON.stringify({ fields: [] }),
            status: 'draft',
            version: 1,
          }),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      vi.doMock('../src/utils/formVersions', () => ({
        autoCreateVersionOnUpdate: vi.fn().mockResolvedValue(undefined),
      }));

      const response = await app.request('/api/forms/test-form-id', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          title: 'Updated Title',
          schema: { fields: [{ id: 'new-field', type: 'text', label: 'New Field' }] },
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify that version was incremented
      expect(mockEnv.DB.prepare).toHaveBeenCalledWith(
        expect.stringContaining('version = version + 1')
      );
    });

    it('should reject update for non-member workspace', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspaceMembership: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({
            success: false,
            error: 'Access denied: not a member of this workspace',
          }), { status: 403 })
        ),
      }));

      const response = await app.request('/api/forms/test-form-id', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          title: 'Updated Title',
        }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Access denied: not a member of this workspace');
    });

    it('should reject status change for non-owner/non-admin user', async () => {
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
          role: 'member', // Not owner or admin
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            title: 'Old Title',
            description: 'Old description',
            form_schema: JSON.stringify({ fields: [] }),
            status: 'draft',
            version: 1,
          }),
        }),
      });

      const response = await app.request('/api/forms/test-form-id', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          status: 'published', // Only owner/admin can publish
        }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Insufficient permissions to change form status');
    });
  });

  describe('DELETE /api/forms/:id', () => {
    it('should successfully soft delete form', async () => {
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
          role: 'owner',
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            status: 'draft',
          }),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      mockEnv.FORM_CACHE = {
        delete: vi.fn().mockResolvedValue(undefined),
      };

      const response = await app.request('/api/forms/test-form-id', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Form deleted successfully');
    });

    it('should reject deletion of published form', async () => {
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
          role: 'owner',
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            status: 'published', // Cannot delete published form
          }),
        }),
      });

      const response = await app.request('/api/forms/test-form-id', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Cannot delete published form. Archive it first.');
    });

    it('should reject deletion for non-owner/non-admin user', async () => {
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
          role: 'member', // Not owner or admin
        }),
      }));

      const response = await app.request('/api/forms/test-form-id', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Insufficient permissions to delete form');
    });
  });

  describe('POST /api/forms/:id/duplicate', () => {
    it('should successfully duplicate form', async () => {
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
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            title: 'Original Form',
            description: 'Original description',
            form_schema: JSON.stringify({ fields: [] }),
            status: 'published',
          }),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      const response = await app.request('/api/forms/test-form-id/duplicate', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.title).toBe('Original Form (Copy)');
      expect(data.data.status).toBe('draft'); // Always created as draft
      expect(data.data.schema).toEqual({ fields: [] });
      expect(data.message).toBe('Form duplicated successfully');
    });
  });

  describe('PATCH /api/forms/:id/status', () => {
    it('should successfully update form status', async () => {
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
          role: 'owner',
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            status: 'draft',
          }),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      mockEnv.FORM_CACHE = {
        delete: vi.fn().mockResolvedValue(undefined),
      };

      const response = await app.request('/api/forms/test-form-id/status', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          status: 'published',
        }),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.message).toBe('Form status updated to published');
    });

    it('should reject status change to same status', async () => {
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
          role: 'owner',
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            status: 'published',
          }),
        }),
      });

      const response = await app.request('/api/forms/test-form-id/status', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          status: 'published', // Same as current
        }),
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Status is already set to that value');
    });

    it('should reject publish for non-owner/non-admin user', async () => {
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
          role: 'member', // Not owner or admin
        }),
      }));

      const response = await app.request('/api/forms/test-form-id/status', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: JSON.stringify({
          status: 'published',
        }),
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Insufficient permissions to publish form');
    });
  });

  describe('Form Submissions', () => {
    it('should list form submissions with pagination', async () => {
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
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'test-form-id',
            workspace_id: 'test-workspace-id',
          }),
          all: vi.fn().mockResolvedValue({
            results: [
              {
                id: 'submission-1',
                form_id: 'test-form-id',
                data: JSON.stringify({ name: 'John Doe', email: 'john@example.com' }),
                ip_address: '127.0.0.1',
                user_agent: 'Test Agent',
                referrer: 'https://formweaver.com',
                submitted_at: Date.now() - 3600000, // 1 hour ago
              },
              {
                id: 'submission-2',
                form_id: 'test-form-id',
                data: JSON.stringify({ name: 'Jane Smith', email: 'jane@example.com' }),
                ip_address: '127.0.0.1',
                user_agent: 'Test Agent',
                referrer: 'https://formweaver.com',
                submitted_at: Date.now() - 1800000, // 30 minutes ago
              },
            ],
          }),
        }),
      });

      const response = await app.request('/api/forms/test-form-id/submissions?limit=5', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.submissions).toHaveLength(2);
      expect(data.data.submissions[0].data.name).toBe('John Doe');
      expect(data.data.submissions[0].data.email).toBe('john@example.com');
      expect(data.data.pagination.total).toBeDefined();
    });

    it('should get single submission details', async () => {
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
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'submission-1',
            form_id: 'test-form-id',
            data: JSON.stringify({ name: 'John Doe', email: 'john@example.com' }),
            ip_address: '127.0.0.1',
            user_agent: 'Test Agent',
            referrer: 'https://formweaver.com',
            submitted_at: Date.now() - 3600000,
            workspace_id: 'test-workspace-id',
            form_title: 'Test Form',
          }),
        }),
      });

      const response = await app.request('/api/forms/test-form-id/submissions/submission-1', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.id).toBe('submission-1');
      expect(data.data.formTitle).toBe('Test Form');
      expect(data.data.data.name).toBe('John Doe');
      expect(data.data.submittedAt).toBeDefined();
    });

    it('should filter submissions by date range', async () => {
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
      }));

      const startDate = Date.now() - 86400000; // 24 hours ago
      const endDate = Date.now();

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 'test-form-id',
            workspace_id: 'test-workspace-id',
          }),
          all: vi.fn().mockResolvedValue({
            results: [
              {
                id: 'submission-1',
                form_id: 'test-form-id',
                data: JSON.stringify({ name: 'Recent User' }),
                ip_address: '127.0.0.1',
                user_agent: 'Test Agent',
                referrer: 'https://formweaver.com',
                submitted_at: Date.now() - 3600000, // Within range
              },
            ],
          }),
        }),
      });

      const response = await app.request(`/api/forms/test-form-id/submissions?dateFrom=${startDate}&dateTo=${endDate}`, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.submissions).toHaveLength(1);
      expect(data.data.submissions[0].data.name).toBe('Recent User');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockRejectedValue(new Error('Database connection failed')),
        }),
      });

      const response = await app.request('/api/forms/test-form-id', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Failed to get form');
    });

    it('should handle invalid form ID format', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      const response = await app.request('/api/forms/invalid-uuid', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer test-token' },
      });

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('Invalid');
    });

    it('should handle malformed JSON in form updates', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'test-user-id');
          c.set('workspaceId', 'test-workspace-id');
          return next();
        }),
      }));

      const response = await app.request('/api/forms/test-form-id', {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token'
        },
        body: 'invalid json',
      });

      expect(response.status).toBe(400);
    });
  });
});