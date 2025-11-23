import type { Bindings } from 'hono/types';

export interface Env extends Bindings {
  DB: D1Database;
  FILE_UPLOADS: R2Bucket;
  FORM_CACHE: KVNamespace;
  ANALYTICS_CACHE: KVNamespace;
  SESSION_STORE: KVNamespace;
  EMAIL_TOKENS: KVNamespace;
  RATE_LIMIT: KVNamespace;
  JWT_SECRET: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  RESEND_API_KEY: string; // Required for email service
  FROM_EMAIL: string; // Email address to send from
  ENVIRONMENT: string;
  JWT_EXPIRES_IN: string;
  REFRESH_TOKEN_EXPIRES_IN: string;
}
