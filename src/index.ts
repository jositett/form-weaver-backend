import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

import auth from './routes/auth';
import forms from './routes/forms';
import submissions from './routes/submissions';

// Environment bindings type
export type Env = {
  DB: D1Database;
  FORM_CACHE: KVNamespace;
  SESSION_STORE: KVNamespace;
  EMAIL_TOKENS: KVNamespace;
  RATE_LIMIT: KVNamespace;
  JWT_SECRET: string;
  ENVIRONMENT: string;
};

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use('*', logger());
app.use('*', prettyJSON());

// CORS configuration
app.use('/api/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));

// Health check
app.get('/', (c) => {
  return c.json({
    status: 'ok',
    message: 'FormWeaver API - Cloudflare Workers + Hono',
    version: '1.0.0',
    environment: c.env.ENVIRONMENT,
  });
});

// API routes
app.get('/api/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
app.route('/api/auth', auth);
app.route('/api/forms', forms);
app.route('/api/submissions', submissions); // Submission management endpoints

// 404 handler
app.notFound((c) => {
  return c.json({
    error: 'Not Found',
    path: c.req.path,
  }, 404);
});

// Error handler
app.onError((err, c) => {
  console.error('[Error]', {
    message: err.message,
    stack: err.stack,
    path: c.req.path,
  });

  return c.json({
    error: 'Internal Server Error',
    message: c.env.ENVIRONMENT === 'development' ? err.message : 'Something went wrong',
  }, 500);
});

export default app;
