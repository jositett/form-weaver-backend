import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';

import auth from './routes/auth';
import forms from './routes/forms';
import submissions from './routes/submissions';
import files from './routes/files';
import formVersionsRouter from './routes/formVersions';
import analyticsRouter from './routes/analytics';
import emailNotificationsRouter from './routes/emailNotifications';
import webhooksRouter from './routes/webhooks';
import exportsRouter from './routes/exports';
import publicForms from './routes/publicForms';

import type { Env } from './types';

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
app.route('/api/files', files); // File upload endpoints
app.route('/api/v1', formVersionsRouter); // Form versioning endpoints
app.route('/api/forms', analyticsRouter); // Analytics endpoints (mounted under /api/forms/:id/analytics)
app.route('/api/forms', emailNotificationsRouter); // Email notification endpoints (mounted under /api/forms/:id/notifications)
app.route('/api/forms', webhooksRouter); // Webhook endpoints (mounted under /api/forms/:id/webhooks)
app.route('/api/forms', exportsRouter); // Export endpoints (mounted under /api/forms/:id/submissions/export)
app.route('/api/f', publicForms); // Public form endpoints (mounted under /api/f/:formId)

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
