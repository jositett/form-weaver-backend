import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import type { HonoContext } from '../types/index';

// Environment bindings type
type Env = {
  DB: D1Database;
  FORM_CACHE: KVNamespace;
  SESSION_STORE: KVNamespace;
  EMAIL_TOKENS: KVNamespace;
  RATE_LIMIT: KVNamespace;
  JWT_SECRET: string;
  ENVIRONMENT: string;
};

// Create submissions router
const submissions = new Hono<{
  Bindings: Env;
  Variables: HonoContext;
}>();

// Submission data schema (dynamic based on form schema, but a base for now)
const submissionSchema = z.record(z.any());

// Query schemas for submission listing
const listSubmissionsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  cursor: z.string().optional(),
  dateFrom: z.coerce.number().optional(), // Unix timestamp
  dateTo: z.coerce.number().optional(),   // Unix timestamp
  search: z.string().optional(), // JSON search in submission data
});

/**
 * Check workspace membership helper
 */
const checkWorkspaceMembership = async (c: any, workspaceId: string) => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({
      success: false,
      error: 'Authentication required',
    }, 401);
  }

  const member = await c.env.DB.prepare(
    'SELECT role FROM workspace_members WHERE user_id = ? AND workspace_id = ?'
  )
    .bind(userId, workspaceId)
    .first();

  if (!member) {
    return c.json({
      success: false,
      error: 'Access denied: not a member of this workspace',
    }, 403);
  }

  return { userId, role: member.role };
};

/**
 * POST /api/f/:formId/submit - Submit form (public)
 */
submissions.post(
  '/:formId/submit',
  zValidator('json', submissionSchema),
  async (c) => {
    const formId = c.req.param('formId');
    const submissionData = c.req.valid('json');

    try {
      // 1. Validate form existence and published status
      const form = await c.env.DB.prepare(
        'SELECT id, schema, status, workspace_id FROM forms WHERE id = ? AND deleted_at IS NULL'
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
          error: 'Form is not published and cannot accept submissions',
        }, 403);
      }

      // 2. Validate submission data against form schema
      const formSchema = JSON.parse(form.schema as string);
      // TODO: Implement dynamic Zod schema validation based on formSchema
      // For now, we'll just check if it's an object.
      if (typeof submissionData !== 'object' || submissionData === null) {
        return c.json({
          success: false,
          error: 'Invalid submission data format',
        }, 400);
      }

      // 3. Store submission in D1
      const now = Date.now();
      const submissionId = crypto.randomUUID();
      const ipAddress = c.req.header('CF-Connecting-IP') || 'unknown';
      const userAgent = c.req.header('User-Agent') || 'unknown';
      const referrer = c.req.header('Referer') || null;

      await c.env.DB.prepare(`
        INSERT INTO submissions (id, form_id, data, ip_address, user_agent, referrer, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          submissionId,
          formId,
          JSON.stringify(submissionData),
          ipAddress,
          userAgent,
          referrer,
          now
        )
        .run();

      return c.json({
        success: true,
        data: {
          id: submissionId,
          formId,
          workspaceId: form.workspace_id,
          submittedAt: now,
        },
        message: 'Form submitted successfully',
      }, 201);

    } catch (error) {
      console.error('[Submit Form Error]', error);
      return c.json({
        success: false,
        error: 'Failed to submit form',
      }, 500);
    }
  }
);

/**
 * GET /api/forms/:formId/submissions - List submissions with pagination and filtering
 */
submissions.get(
  '/forms/:formId/submissions',
  authMiddleware,
  zValidator('query', listSubmissionsQuerySchema),
  async (c) => {
    const formId = c.req.param('formId');
    const query = c.req.valid('query');
    const workspaceId = c.get('workspaceId')!;

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      // Verify form exists and belongs to workspace
      const form = await c.env.DB.prepare(
        'SELECT id, workspace_id FROM forms WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL'
      )
        .bind(formId, workspaceId)
        .first();

      if (!form) {
        return c.json({
          success: false,
          error: 'Form not found or access denied',
        }, 404);
      }

      // Build WHERE conditions for submissions
      const conditions: string[] = ['s.form_id = ?'];
      const params: any[] = [formId];

      // Date range filtering
      if (query.dateFrom) {
        conditions.push('s.submitted_at >= ?');
        params.push(query.dateFrom);
      }
      if (query.dateTo) {
        conditions.push('s.submitted_at <= ?');
        params.push(query.dateTo);
      }

      // Search in submission data (simple JSON search)
      if (query.search) {
        conditions.push('s.data LIKE ?');
        params.push(`%${query.search}%`);
      }

      // Cursor-based pagination
      if (query.cursor) {
        const decodedCursor = atob(query.cursor);
        const cursorValues = decodedCursor.split('|');
        if (cursorValues.length === 2) {
          const cursorTimestamp = parseInt(cursorValues[0]);
          const cursorId = cursorValues[1];
          conditions.push('(s.submitted_at < ? OR (s.submitted_at = ? AND s.id < ?))');
          params.push(cursorTimestamp, cursorTimestamp, cursorId);
        }
      }

      // Execute query
      const limit = query.limit || 50;
      const whereClause = conditions.join(' AND ');

      const submissions = await c.env.DB.prepare(`
        SELECT s.id, s.form_id, s.data, s.ip_address, s.user_agent, s.referrer, s.submitted_at
        FROM submissions s
        WHERE ${whereClause}
        ORDER BY s.submitted_at DESC, s.id ASC
        LIMIT ?
      `)
        .bind(...params, limit + 1) // +1 to check if there's a next page
        .all();

      // Parse submission data and check for next page
      let hasNextPage = false;
      const results = submissions.results.map(row => {
        hasNextPage = submissions.results.length > limit; // Set on last iteration
        return {
          id: row.id,
          formId: row.form_id,
          data: JSON.parse(row.data as string),
          ipAddress: row.ip_address,
          userAgent: row.user_agent,
          referrer: row.referrer,
          submittedAt: row.submitted_at,
        };
      });

      // Remove extra item if there are more results
      if (hasNextPage) {
        results.pop();
      }

      // Generate next cursor
      let nextCursor: string | undefined;
      if (hasNextPage && results.length > 0) {
        const lastResult = results[results.length - 1];
        const cursorValue = `${lastResult.submittedAt}|${lastResult.id}`;
        nextCursor = btoa(cursorValue);
      }

      // Count total submissions for this form
      const totalCount = await c.env.DB.prepare(
        'SELECT COUNT(*) as count FROM submissions WHERE form_id = ?'
      )
        .bind(formId)
        .first();

      return c.json({
        success: true,
        data: {
          submissions: results,
          pagination: {
            hasNextPage,
            nextCursor,
            limit: results.length,
            total: totalCount?.count || 0,
          },
        },
      });

    } catch (error) {
      console.error('[List Submissions Error]', error);
      return c.json({
        success: false,
        error: 'Failed to list submissions',
      }, 500);
    }
  }
);

/**
 * GET /api/forms/:formId/submissions/:submissionId - Get single submission
 */
submissions.get(
  '/forms/:formId/submissions/:submissionId',
  authMiddleware,
  async (c) => {
    const formId = c.req.param('formId');
    const submissionId = c.req.param('submissionId');
    const workspaceId = c.get('workspaceId')!;

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      // Get submission with form validation
      const submission = await c.env.DB.prepare(`
        SELECT s.id, s.form_id, s.data, s.ip_address, s.user_agent, s.referrer, s.submitted_at,
               f.workspace_id, f.title as form_title
        FROM submissions s
        JOIN forms f ON s.form_id = f.id
        WHERE s.id = ? AND s.form_id = ? AND f.workspace_id = ? AND f.deleted_at IS NULL
      `)
        .bind(submissionId, formId, workspaceId)
        .first();

      if (!submission) {
        return c.json({
          success: false,
          error: 'Submission not found or access denied',
        }, 404);
      }

      return c.json({
        success: true,
        data: {
          id: submission.id,
          formId: submission.form_id,
          formTitle: submission.form_title,
          data: JSON.parse(submission.data as string),
          ipAddress: submission.ip_address,
          userAgent: submission.user_agent,
          referrer: submission.referrer,
          submittedAt: submission.submitted_at,
        },
      });

    } catch (error) {
      console.error('[Get Submission Error]', error);
      return c.json({
        success: false,
        error: 'Failed to get submission',
      }, 500);
    }
  }
);

export default submissions;
