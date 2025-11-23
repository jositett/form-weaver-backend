/**
 * Integration Tests
 * End-to-end tests for critical user flows including
 * authentication, workspace management, and form lifecycle
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import authRoutes from '../src/routes/auth';
import workspacesRoutes from '../src/routes/workspaces';
import usersRoutes from '../src/routes/users';
import formsRoutes from '../src/routes/forms';
import { createMiniflareTestEnv } from './setup';

describe('Integration Tests', () => {
  let app: Hono;
  let mockEnv: any;
  let userTokens: { accessToken: string; refreshToken: string };
  let testUser: any;
  let testWorkspace: any;
  let testForm: any;

  beforeEach(async () => {
    const { mf, env } = await createMiniflareTestEnv();
    mockEnv = env;

    // Create app with all routes
    app = new Hono();
    app.route('/api/auth', authRoutes);
    app.route('/api/workspaces', workspacesRoutes);
    app.route('/api/users', usersRoutes);
    app.route('/api/forms', formsRoutes);

    userTokens = {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    };

    testUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      workspaceId: 'test-workspace-id',
      role: 'owner',
    };

    testWorkspace = {
      id: 'test-workspace-id',
      name: 'Test Workspace',
      slug: 'test-workspace',
      ownerId: 'test-user-id',
      planType: 'free',
    };

    testForm = {
      id: 'test-form-id',
      title: 'Test Form',
      workspaceId: 'test-workspace-id',
      status: 'draft',
      version: 1,
    };
  });

  describe('Complete User Journey Flow', () => {
    it('should complete full user journey: signup → email verification → login → profile access → workspace creation → form management', async () => {
      // Step 1: User Signup
      vi.doMock('../src/services/emailService', () => ({
        sendEmailVerification: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('../src/utils/rateLimit', () => ({
        checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null), // No existing user
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      mockEnv.DB.batch = vi.fn().mockResolvedValue([{}, {}, {}]);
      mockEnv.EMAIL_TOKENS = {
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined),
      };

      const signupResponse = await app.request('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'integration@example.com',
          password: 'password123',
          name: 'Integration Test User',
        }),
      });

      expect(signupResponse.status).toBe(201);
      const signupData = await signupResponse.json();
      expect(signupData.success).toBe(true);
      expect(signupData.data.user.email).toBe('integration@example.com');
      expect(signupData.data.accessToken).toBeDefined();
      expect(signupData.data.refreshToken).toBeDefined();

      const newUserTokens = {
        accessToken: signupData.data.accessToken,
        refreshToken: signupData.data.refreshToken,
      };

      // Step 2: Email Verification (simulate)
      mockEnv.EMAIL_TOKENS = {
        get: vi.fn().mockResolvedValue(JSON.stringify({
          userId: signupData.data.user.id,
          email: 'integration@example.com',
          createdAt: Date.now(),
        })),
        delete: vi.fn().mockResolvedValue(undefined),
      };

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      const verificationResponse = await app.request('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'verification-token',
        }),
      });

      expect(verificationResponse.status).toBe(200);
      const verificationData = await verificationResponse.json();
      expect(verificationData.success).toBe(true);
      expect(verificationData.message).toBe('Email verified successfully');

      // Step 3: Login with verified account
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: signupData.data.user.id,
            email: 'integration@example.com',
            password_hash: '$2b$10$hashedpassword',
            name: 'Integration Test User',
            email_verified: 1,
            created_at: Date.now(),
            updated_at: Date.now(),
          }),
        }),
      });

      vi.doMock('../src/utils/validation', () => ({
        verifyPassword: vi.fn().mockResolvedValue(true),
      }));

      const loginResponse = await app.request('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'integration@example.com',
          password: 'password123',
        }),
      });

      expect(loginResponse.status).toBe(200);
      const loginData = await loginResponse.json();
      expect(loginData.success).toBe(true);
      expect(loginData.data.user.email).toBe('integration@example.com');
      expect(loginData.data.user.emailVerified).toBe(true);

      const verifiedUserTokens = {
        accessToken: loginData.data.accessToken,
        refreshToken: loginData.data.refreshToken,
      };

      // Step 4: Access user profile
      vi.doMock('../src/utils/user', () => ({
        getUserProfileWithDetails: vi.fn().mockResolvedValue({
          profile: {
            id: signupData.data.user.id,
            email: 'integration@example.com',
            name: 'Integration Test User',
            emailVerified: true,
            preferences: {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          memberships: [],
          usage: {},
        }),
      }));

      const profileResponse = await app.request('/api/users/profile', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${verifiedUserTokens.accessToken}` },
      });

      expect(profileResponse.status).toBe(200);
      const profileData = await profileResponse.json();
      expect(profileData.success).toBe(true);
      expect(profileData.data.profile.email).toBe('integration@example.com');
      expect(profileData.data.profile.name).toBe('Integration Test User');

      // Step 5: Create workspace
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', signupData.data.user.id);
          return next();
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 0 }), // No existing workspaces
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      mockEnv.DB.batch = vi.fn().mockResolvedValue([{}, {}]);

      const workspaceResponse = await app.request('/api/workspaces', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${verifiedUserTokens.accessToken}`
        },
        body: JSON.stringify({
          name: 'Integration Test Workspace',
          slug: 'integration-test-workspace',
        }),
      });

      expect(workspaceResponse.status).toBe(201);
      const workspaceData = await workspaceResponse.json();
      expect(workspaceData.success).toBe(true);
      expect(workspaceData.data.name).toBe('Integration Test Workspace');
      expect(workspaceData.data.ownerId).toBe(signupData.data.user.id);

      const newWorkspaceId = workspaceData.data.id;

      // Step 6: Create form in workspace
      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspaceMembership: vi.fn().mockResolvedValue({
          userId: signupData.data.user.id,
          role: 'owner',
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      const formSchema = {
        title: 'Integration Test Form',
        fields: [
          {
            id: 'name-field',
            type: 'text',
            label: 'Name',
            required: true,
          },
          {
            id: 'email-field',
            type: 'email',
            label: 'Email',
            required: true,
          },
        ],
      };

      const formResponse = await app.request('/api/forms', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${verifiedUserTokens.accessToken}`
        },
        body: JSON.stringify({
          title: 'Integration Test Form',
          description: 'A form created during integration testing',
          schema: formSchema,
          status: 'draft',
        }),
      });

      expect(formResponse.status).toBe(201);
      const formData = await formResponse.json();
      expect(formData.success).toBe(true);
      expect(formData.data.title).toBe('Integration Test Form');
      expect(formData.data.schema).toEqual(formSchema);
      expect(formData.data.status).toBe('draft');

      const newFormId = formData.data.id;

      // Step 7: Update form status to published
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            title: 'Integration Test Form',
            description: 'A form created during integration testing',
            form_schema: JSON.stringify(formSchema),
            status: 'draft',
            version: 1,
          }),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      const publishResponse = await app.request(`/api/forms/${newFormId}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${verifiedUserTokens.accessToken}`
        },
        body: JSON.stringify({
          status: 'published',
        }),
      });

      expect(publishResponse.status).toBe(200);
      const publishData = await publishResponse.json();
      expect(publishData.success).toBe(true);
      expect(publishData.message).toBe('Form status updated to published');

      // Step 8: List forms to verify creation
      const listFormsResponse = await app.request('/api/forms', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${verifiedUserTokens.accessToken}` },
      });

      expect(listFormsResponse.status).toBe(200);
      const listFormsData = await listFormsResponse.json();
      expect(listFormsData.success).toBe(true);
      expect(listFormsData.data.forms).toHaveLength(1);
      expect(listFormsData.data.forms[0].title).toBe('Integration Test Form');
      expect(listFormsData.data.forms[0].status).toBe('published');
    });
  });

  describe('Workspace Management Flow', () => {
    it('should complete workspace lifecycle: create → add member → manage forms → usage statistics', async () => {
      // Mock authentication
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', testUser.id);
          c.set('workspaceId', testWorkspace.id);
          return next();
        }),
      }));

      // Step 1: Create workspace
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 0 }), // No existing workspaces
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      mockEnv.DB.batch = vi.fn().mockResolvedValue([{}, {}]);

      const createWorkspaceResponse = await app.request('/api/workspaces', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userTokens.accessToken}`
        },
        body: JSON.stringify({
          name: 'Workspace Management Test',
          slug: 'workspace-management-test',
        }),
      });

      expect(createWorkspaceResponse.status).toBe(201);
      const workspaceData = await createWorkspaceResponse.json();
      expect(workspaceData.success).toBe(true);
      const workspaceId = workspaceData.data.id;

      // Step 2: Add member to workspace
      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspacePermission: vi.fn().mockResolvedValue({
          userId: testUser.id,
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

      const addMemberResponse = await app.request(`/api/workspaces/${workspaceId}/members`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userTokens.accessToken}`
        },
        body: JSON.stringify({
          email: 'member@example.com',
          role: 'member',
        }),
      });

      expect(addMemberResponse.status).toBe(201);
      const addMemberData = await addMemberResponse.json();
      expect(addMemberData.success).toBe(true);
      expect(addMemberData.message).toBe('Member added successfully');

      // Step 3: Create multiple forms in workspace
      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspaceMembership: vi.fn().mockResolvedValue({
          userId: testUser.id,
          role: 'owner',
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      // Create first form
      const form1Response = await app.request('/api/forms', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userTokens.accessToken}`
        },
        body: JSON.stringify({
          title: 'First Test Form',
          schema: { fields: [{ id: 'field1', type: 'text', label: 'Field 1' }] },
          status: 'published',
        }),
      });

      expect(form1Response.status).toBe(201);

      // Create second form
      const form2Response = await app.request('/api/forms', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userTokens.accessToken}`
        },
        body: JSON.stringify({
          title: 'Second Test Form',
          schema: { fields: [{ id: 'field1', type: 'email', label: 'Email' }] },
          status: 'draft',
        }),
      });

      expect(form2Response.status).toBe(201);

      // Step 4: Get workspace usage statistics
      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspaceMembership: vi.fn().mockResolvedValue({
          userId: testUser.id,
          role: 'owner',
        }),
        getPlanLimits: vi.fn().mockReturnValue({
          maxForms: 100,
          maxSubmissions: 10000,
          maxStorage: 100 * 1024 * 1024,
          maxMembers: 10,
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ count: 2 }), // 2 forms
        }),
      });

      const usageResponse = await app.request(`/api/workspaces/${workspaceId}/usage`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${userTokens.accessToken}` },
      });

      expect(usageResponse.status).toBe(200);
      const usageData = await usageResponse.json();
      expect(usageData.success).toBe(true);
      expect(usageData.data.workspaceId).toBe(workspaceId);
      expect(usageData.data.formCount).toBe(2);
      expect(usageData.data.memberCount).toBe(2); // Owner + 1 member
      expect(usageData.data.planType).toBe('free');
      expect(usageData.data.limits.maxForms).toBe(100);

      // Step 5: List workspace members
      const membersResponse = await app.request(`/api/workspaces/${workspaceId}/members`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${userTokens.accessToken}` },
      });

      expect(membersResponse.status).toBe(200);
      const membersData = await membersResponse.json();
      expect(membersData.success).toBe(true);
      expect(membersData.data.members).toHaveLength(2); // Owner + added member
      expect(membersData.data.count).toBe(2);

      // Step 6: Remove member from workspace
      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspacePermission: vi.fn().mockResolvedValue({
          userId: testUser.id,
          role: 'owner',
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({ owner_id: testUser.id }), // Not owner
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      const removeMemberResponse = await app.request(`/api/workspaces/${workspaceId}/members/member-user-id`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${userTokens.accessToken}` },
      });

      expect(removeMemberResponse.status).toBe(200);
      const removeMemberData = await removeMemberResponse.json();
      expect(removeMemberData.success).toBe(true);
      expect(removeMemberData.message).toBe('Member removed successfully');
    });
  });

  describe('Form Lifecycle Flow', () => {
    it('should complete form lifecycle: create → version management → submissions → analytics', async () => {
      // Mock authentication
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', testUser.id);
          c.set('workspaceId', testWorkspace.id);
          return next();
        }),
      }));

      vi.doMock('../src/utils/workspace', () => ({
        checkWorkspaceMembership: vi.fn().mockResolvedValue({
          userId: testUser.id,
          role: 'owner',
        }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      // Step 1: Create initial form
      const initialSchema = {
        title: 'Lifecycle Test Form',
        fields: [
          { id: 'name', type: 'text', label: 'Name', required: true },
          { id: 'email', type: 'email', label: 'Email', required: true },
        ],
      };

      const createFormResponse = await app.request('/api/forms', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userTokens.accessToken}`
        },
        body: JSON.stringify({
          title: 'Lifecycle Test Form',
          description: 'Form for testing lifecycle management',
          schema: initialSchema,
          status: 'draft',
        }),
      });

      expect(createFormResponse.status).toBe(201);
      const formData = await createFormResponse.json();
      expect(formData.success).toBe(true);
      const formId = formData.data.id;

      // Step 2: Publish the form
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            title: 'Lifecycle Test Form',
            description: 'Form for testing lifecycle management',
            form_schema: JSON.stringify(initialSchema),
            status: 'draft',
            version: 1,
          }),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      vi.doMock('../src/utils/formVersions', () => ({
        autoCreateVersionOnUpdate: vi.fn().mockResolvedValue(undefined),
      }));

      const publishResponse = await app.request(`/api/forms/${formId}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userTokens.accessToken}`
        },
        body: JSON.stringify({
          status: 'published',
        }),
      });

      expect(publishResponse.status).toBe(200);
      const publishData = await publishResponse.json();
      expect(publishData.success).toBe(true);

      // Step 3: Update form schema (triggers version creation)
      const updatedSchema = {
        title: 'Lifecycle Test Form',
        fields: [
          { id: 'name', type: 'text', label: 'Full Name', required: true },
          { id: 'email', type: 'email', label: 'Email Address', required: true },
          { id: 'phone', type: 'tel', label: 'Phone Number', required: false },
        ],
      };

      const updateFormResponse = await app.request(`/api/forms/${formId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userTokens.accessToken}`
        },
        body: JSON.stringify({
          title: 'Updated Lifecycle Test Form',
          schema: updatedSchema,
        }),
      });

      expect(updateFormResponse.status).toBe(200);
      const updateData = await updateFormResponse.json();
      expect(updateData.success).toBe(true);

      // Step 4: Duplicate the form
      const duplicateResponse = await app.request(`/api/forms/${formId}/duplicate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${userTokens.accessToken}` },
      });

      expect(duplicateResponse.status).toBe(201);
      const duplicateData = await duplicateResponse.json();
      expect(duplicateData.success).toBe(true);
      expect(duplicateData.data.title).toBe('Updated Lifecycle Test Form (Copy)');
      expect(duplicateData.data.status).toBe('draft');

      const duplicateFormId = duplicateData.data.id;

      // Step 5: Archive original form
      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            status: 'published',
          }),
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      const archiveResponse = await app.request(`/api/forms/${formId}/status`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${userTokens.accessToken}`
        },
        body: JSON.stringify({
          status: 'archived',
        }),
      });

      expect(archiveResponse.status).toBe(200);
      const archiveData = await archiveResponse.json();
      expect(archiveData.success).toBe(true);
      expect(archiveData.message).toBe('Form status updated to archived');

      // Step 6: Delete duplicate form
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

      const deleteResponse = await app.request(`/api/forms/${duplicateFormId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${userTokens.accessToken}` },
      });

      expect(deleteResponse.status).toBe(200);
      const deleteData = await deleteResponse.json();
      expect(deleteData.success).toBe(true);
      expect(deleteData.message).toBe('Form deleted successfully');

      // Step 7: List forms to verify state
      const listResponse = await app.request('/api/forms', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${userTokens.accessToken}` },
      });

      expect(listResponse.status).toBe(200);
      const listData = await listResponse.json();
      expect(listData.success).toBe(true);
      expect(listData.data.forms).toHaveLength(1); // Only original form remains
      expect(listData.data.forms[0].id).toBe(formId);
      expect(listData.data.forms[0].status).toBe('archived');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle authentication errors throughout the flow', async () => {
      // Try to access protected routes without authentication
      const unprotectedRoutes = [
        { method: 'GET', path: '/api/users/profile' },
        { method: 'POST', path: '/api/workspaces', body: { name: 'Test' } },
        { method: 'POST', path: '/api/forms', body: { title: 'Test' } },
      ];

      for (const route of unprotectedRoutes) {
        const response = await app.request(route.path, {
          method: route.method,
          headers: route.body ? { 'Content-Type': 'application/json' } : {},
          body: route.body ? JSON.stringify(route.body) : undefined,
        });

        expect(response.status).toBe(401);
        const data = await response.json();
        expect(data.success).toBe(false);
        expect(data.error).toBe('Missing authorization header');
      }
    });

    it('should handle workspace access control errors', async () => {
      // Mock authentication for user not in workspace
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', 'different-user-id');
          c.set('workspaceId', 'different-workspace-id');
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
        method: 'GET',
        headers: { 'Authorization': 'Bearer different-token' },
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Access denied: not a member of this workspace');
    });

    it('should handle rate limiting across multiple requests', async () => {
      vi.doMock('../src/middleware/auth', () => ({
        authMiddleware: vi.fn().mockImplementation((c, next) => {
          c.set('userId', testUser.id);
          return next();
        }),
      }));

      vi.doMock('../src/utils/rateLimit', () => ({
        checkRateLimit: vi.fn().mockResolvedValue({ allowed: false, retryAfter: 3600 }),
      }));

      const response = await app.request('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  describe('Data Consistency', () => {
    it('should maintain data consistency across related operations', async () => {
      // Create user
      vi.doMock('../src/services/emailService', () => ({
        sendEmailVerification: vi.fn().mockResolvedValue(true),
      }));

      vi.doMock('../src/utils/rateLimit', () => ({
        checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null), // No existing user
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        }),
      });

      mockEnv.DB.batch = vi.fn().mockResolvedValue([{}, {}, {}]);
      mockEnv.EMAIL_TOKENS = {
        put: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockResolvedValue(null),
        delete: vi.fn().mockResolvedValue(undefined),
      };

      const signupResponse = await app.request('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'consistency@example.com',
          password: 'password123',
          name: 'Consistency Test User',
        }),
      });

      expect(signupResponse.status).toBe(201);
      const signupData = await signupResponse.json();
      const userId = signupData.data.user.id;
      const workspaceId = signupData.data.workspace.id;

      // Verify user and workspace were created together
      expect(userId).toBeDefined();
      expect(workspaceId).toBeDefined();
      expect(signupData.data.workspace.ownerId).toBe(userId);

      // Verify profile includes workspace membership
      vi.doMock('../src/utils/user', () => ({
        getUserProfileWithDetails: vi.fn().mockResolvedValue({
          profile: {
            id: userId,
            email: 'consistency@example.com',
            name: 'Consistency Test User',
            emailVerified: false,
            preferences: {},
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
          memberships: [
            {
              workspace: {
                id: workspaceId,
                name: signupData.data.workspace.name,
                slug: signupData.data.workspace.slug,
                ownerId: userId,
                planType: 'free',
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
              role: 'owner',
              invitedAt: Date.now(),
              joinedAt: Date.now(),
            },
          ],
          usage: {},
        }),
      }));

      const profileResponse = await app.request('/api/users/profile?includeMemberships=true', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${signupData.data.accessToken}` },
      });

      expect(profileResponse.status).toBe(200);
      const profileData = await profileResponse.json();
      expect(profileData.data.memberships).toHaveLength(1);
      expect(profileData.data.memberships[0].workspace.id).toBe(workspaceId);
      expect(profileData.data.memberships[0].role).toBe('owner');
    });
  });
});