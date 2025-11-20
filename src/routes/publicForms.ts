import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { checkRateLimit, getClientIP, createRateLimitHeaders } from '../utils/rateLimit';
import type { Env, HonoContext } from '../types/index';
import { getDb } from '../db/db';

// Create public forms router
const publicForms = new Hono<{
  Bindings: Env;
  Variables: HonoContext;
}>();

/**
 * GET /f/:formId - Get public form (with view tracking)
 */
publicForms.get(
  '/:formId',
  async (c) => {
    const formId = c.req.param('formId');

    try {
      // 1. Validate form existence and published status
      const form = await getDb(c.env).prepare(
        'SELECT id, title, description, schema, status, workspace_id FROM forms WHERE id = ? AND deleted_at IS NULL'
      )
        .bind(formId)
        .first();

      if (!form) {
        return c.json({
          success: false,
          error: 'Form not found',
        }, 404);
      }

      if (form.status !== 'published') {
        return c.json({
          success: false,
          error: 'Form is not published',
        }, 403);
      }

      // 2. Track form view (rate limited to prevent spam)
      const clientIP = getClientIP(c.req.raw);
      const rateLimitKey = `view:${clientIP}:form:${formId}`;

      // Allow 10 views per minute per IP per form (to prevent spam but allow legitimate refreshes)
      const rateLimitResult = await checkRateLimit(c.env.RATE_LIMIT, rateLimitKey, {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 10,
      });

      if (rateLimitResult.allowed) {
        // Track the view
        const now = Date.now();
        const viewId = crypto.randomUUID();
        const ipAddress = c.req.header('CF-Connecting-IP') || clientIP;
        const userAgent = c.req.header('User-Agent') || 'unknown';
        const referrer = c.req.header('Referer') || null;

        try {
          await getDb(c.env).prepare(`
            INSERT INTO form_views (id, form_id, ip_address, user_agent, referrer, viewed_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `)
            .bind(viewId, formId, ipAddress, userAgent, referrer, Math.floor(now / 1000))
            .run();
        } catch (error) {
          // Don't fail the request if view tracking fails
          console.error('[Form View Tracking Error]', error);
        }
      }

      // 3. Return form data
      return c.json({
        success: true,
        data: {
          id: form.id,
          title: form.title,
          description: form.description,
          schema: JSON.parse(form.schema as string),
          status: form.status,
          workspaceId: form.workspace_id,
        },
      });

    } catch (error) {
      console.error('[Get Public Form Error]', error);
      return c.json({
        success: false,
        error: 'Failed to get form',
      }, 500);
    }
  }
);

/**
 * POST /f/:formId/view - Track form view (explicit endpoint)
 */
publicForms.post(
  '/:formId/view',
  async (c) => {
    const formId = c.req.param('formId');

    try {
      // 1. Validate form existence and published status
      const form = await getDb(c.env).prepare(
        'SELECT id, status FROM forms WHERE id = ? AND deleted_at IS NULL'
      )
        .bind(formId)
        .first();

      if (!form) {
        return c.json({
          success: false,
          error: 'Form not found',
        }, 404);
      }

      if (form.status !== 'published') {
        return c.json({
          success: false,
          error: 'Form is not published',
        }, 403);
      }

      // 2. Rate limit view tracking
      const clientIP = getClientIP(c.req.raw);
      const rateLimitKey = `view:${clientIP}:form:${formId}`;

      // Allow 10 views per minute per IP per form
      const rateLimitResult = await checkRateLimit(c.env.RATE_LIMIT, rateLimitKey, {
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 10,
      });

      if (!rateLimitResult.allowed) {
        const headers = createRateLimitHeaders(rateLimitResult);
        return c.json({
          success: false,
          error: 'Rate limit exceeded for view tracking',
        }, 429, headers);
      }

      // 3. Track the view
      const now = Date.now();
      const viewId = crypto.randomUUID();
      const ipAddress = c.req.header('CF-Connecting-IP') || clientIP;
      const userAgent = c.req.header('User-Agent') || 'unknown';
      const referrer = c.req.header('Referer') || null;

      await getDb(c.env).prepare(`
        INSERT INTO form_views (id, form_id, ip_address, user_agent, referrer, viewed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
        .bind(viewId, formId, ipAddress, userAgent, referrer, Math.floor(now / 1000))
        .run();

      return c.json({
        success: true,
        message: 'Form view tracked successfully',
      });

    } catch (error) {
      console.error('[Track Form View Error]', error);
      return c.json({
        success: false,
        error: 'Failed to track form view',
      }, 500);
    }
  }
);

export default publicForms;