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
  EMAIL_TOKENS?: KVNamespace;
  RATE_LIMIT?: KVNamespace;
  FORM_CACHE?: KVNamespace;
  ANALYTICS_CACHE?: KVNamespace;
  RESEND_API_KEY?: string;
  FROM_EMAIL?: string;
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
    EMAIL_TOKENS: {
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    } as unknown as KVNamespace,
    RATE_LIMIT: {
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    } as unknown as KVNamespace,
    FORM_CACHE: {
      put: vi.fn(),
      get: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    } as unknown as KVNamespace,
    ANALYTICS_CACHE: {
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
    RESEND_API_KEY: 'test-resend-api-key',
    FROM_EMAIL: 'noreply@test.com',
  };

  const env = { ...defaultEnv, ...overrides };

  // Filter out non-JSON-serializable bindings for Miniflare's `bindings` property
  const mfBindings: Record<string, string | number | boolean | undefined> = {};
  for (const key in env) {
    if (
      typeof env[key as keyof TestEnv] === 'string' ||
      typeof env[key as keyof TestEnv] === 'number' ||
      typeof env[key as keyof TestEnv] === 'boolean'
    ) {
      mfBindings[key] = env[key as keyof TestEnv] as string | number | boolean | undefined;
    }
  }

  const mf = new Miniflare({
    script: `
      import app from './src/index.ts';
      export default app;
    `,
    bindings: {
      ...mfBindings,
      JWT_SECRET: env.JWT_SECRET,
      ENVIRONMENT: env.ENVIRONMENT,
      ...(env.SMTP_HOST && { SMTP_HOST: env.SMTP_HOST }),
      ...(env.SMTP_PORT && { SMTP_PORT: env.SMTP_PORT }),
      ...(env.SMTP_USER && { SMTP_USER: env.SMTP_USER }),
      ...(env.SMTP_PASS && { SMTP_PASS: env.SMTP_PASS }),
      ...(env.WEBHOOK_SECRET && { WEBHOOK_SECRET: env.WEBHOOK_SECRET }),
      ...(env.CLOUDFLARE_ACCOUNT_ID && { CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID }),
      RESEND_API_KEY: 'test-resend-api-key', // Add missing RESEND_API_KEY
      FROM_EMAIL: 'noreply@test.com', // Add missing FROM_EMAIL
   } as Record<string, string | number | boolean>, // Cast to a type compatible with Json
   kvNamespaces: ['SESSION_STORE', 'EMAIL_TOKENS', 'RATE_LIMIT', 'FORM_CACHE', 'ANALYTICS_CACHE'],
   d1Databases: ['DB'],
   r2Buckets: ['R2_BUCKET'],
   compatibilityFlags: ['nodejs_compat'],
   logLevel: 2, // INFO level
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
