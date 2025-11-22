import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Miniflare } from 'miniflare';

// Mock environment for testing
export interface TestEnv {
  JWT_SECRET: string;
  SESSION_STORE: KVNamespace;
  DB: D1Database;
  ENVIRONMENT: string;
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  WEBHOOK_SECRET?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  R2_BUCKET?: R2Bucket;
}

// Create a Miniflare instance for testing
export async function createMiniflareTestEnv(overrides: Partial<TestEnv> = {}): Promise<{
  mf: Miniflare;
  env: TestEnv;
}> {
  // Default test environment
  const defaultEnv: TestEnv = {
    JWT_SECRET: 'test-jwt-secret-key-for-testing-only',
    SESSION_STORE: {
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    } as unknown as KVNamespace,
    DB: {
      prepare: vi.fn(),
      exec: vi.fn(),
      batch: vi.fn(),
    } as unknown as D1Database,
    ENVIRONMENT: 'test',
    SMTP_HOST: 'smtp.example.com',
    SMTP_PORT: 587,
    SMTP_USER: 'test@example.com',
    SMTP_PASS: 'test-password',
    WEBHOOK_SECRET: 'test-webhook-secret',
    CLOUDFLARE_ACCOUNT_ID: 'test-account-id',
    R2_BUCKET: {
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      head: vi.fn(),
      list: vi.fn(),
    } as unknown as R2Bucket,
  };

  const env = { ...defaultEnv, ...overrides };

  const mf = new Miniflare({
    script: `
      import app from './src/index.ts';
      export default app;
    `,
    bindings: env,
    kvNamespaces: ['SESSION_STORE'],
    d1Databases: ['DB'],
    r2Buckets: ['R2_BUCKET'],
    compatibilityFlags: ['nodejs_compat'],
  });

  return { mf, env };
}

// Mock database helpers
export const mockDatabase = {
  // Mock successful query
  mockSuccess: (data: any = {}) => ({
    results: [data],
    success: true,
    error: null,
  }),

  // Mock error query
  mockError: (message: string = 'Database error') => ({
    results: [],
    success: false,
    error: message,
  }),

  // Mock empty result
  mockEmpty: () => ({
    results: [],
    success: true,
    error: null,
  }),
};

// Test utilities
export const testUtils = {
  // Create a valid JWT token for testing
  createTestToken: async (payload: any = {}) => {
    const { generateToken } = await import('../utils/jwt');
    return generateToken(
      {
        sub: 'test-user-id',
        email: 'test@example.com',
        workspaceId: 'test-workspace-id',
        role: 'admin',
        type: 'access',
        ...payload,
      },
      'test-jwt-secret-key-for-testing-only'
    );
  },

  // Create test user data
  createTestUser: (overrides: any = {}) => ({
    id: 'test-user-id',
    email: 'test@example.com',
    name: 'Test User',
    workspaceId: 'test-workspace-id',
    role: 'admin',
    createdAt: new Date().toISOString(),
    ...overrides,
  }),

  // Create test form data
  createTestForm: (overrides: any = {}) => ({
    id: 'test-form-id',
    name: 'Test Form',
    workspaceId: 'test-workspace-id',
    config: {
      title: 'Test Form',
      fields: [],
      theme: 'default',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }),

  // Create test submission data
  createTestSubmission: (overrides: any = {}) => ({
    id: 'test-submission-id',
    formId: 'test-form-id',
    versionId: 'test-version-id',
    data: {},
    createdAt: new Date().toISOString(),
    ...overrides,
  }),
};

// Common test patterns
export const testPatterns = {
  // Valid email pattern
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  // UUID pattern
  uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

  // JWT token pattern
  jwt: /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/,
};

// Export vitest globals for convenience
export { describe, it, expect, beforeEach, afterEach, vi };