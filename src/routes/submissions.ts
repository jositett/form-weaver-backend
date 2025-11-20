import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { checkRateLimit, getClientIP, createRateLimitHeaders } from '../utils/rateLimit';
import type { Env, HonoContext, File, Submission } from '../types/index';
import { getDb } from '../db/db';
import { getSignedFileUrl } from '../utils/files';

// Create submissions router
const submissions = new Hono<{
  Bindings: Env;
  Variables: HonoContext;
}>();

// Submission data schema (dynamic based on form schema, but a base for now)
const submissionSchema = z.record(z.string(), z.any());

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

  const member = await getDb(c.env).prepare(
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
      const form = await getDb(c.env).prepare(
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

      // 2. Check rate limit (10 submissions per 10 minutes per IP)
      const clientIP = getClientIP(c.req.raw);
      const rateLimitKey = `${clientIP}:form:${formId}`;

      const rateLimitResult = await checkRateLimit(c.env.RATE_LIMIT, rateLimitKey);

      if (!rateLimitResult.allowed) {
        const headers = createRateLimitHeaders(rateLimitResult);
        return c.json({
          success: false,
          error: 'Rate limit exceeded. Please try again later.',
        }, 429, headers);
      }

      // 3. Validate submission data against form schema
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

      await getDb(c.env).prepare(`
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

      // 4. Trigger webhooks (if configured)
      try {
        await triggerWebhooks(c.env, formId, {
          id: submissionId,
          formId,
          workspaceId: form.workspace_id as string,
          data: submissionData,
          submittedAt: now,
          ipAddress,
          userAgent,
          referrer,
        });
      } catch (error) {
        console.error('[Webhook Error]', error);
        // Don't fail the submission due to webhook errors
      }

      // 5. Send email notifications (if configured)
      try {
        await sendNotificationEmails(c.env, formId, {
          id: submissionId,
          formId,
          workspaceId: form.workspace_id as string,
          data: submissionData,
          submittedAt: now,
        });
      } catch (error) {
        console.error('[Email Notification Error]', error);
        // Don't fail the submission due to email errors
      }

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
      const form = await getDb(c.env).prepare(
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

      const submissions = await getDb(c.env).prepare(`
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
      const totalCount = await getDb(c.env).prepare(
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
      const submission = await getDb(c.env).prepare(`
        SELECT s.id, s.form_id, s.form_version_id, s.data, s.ip_address, s.user_agent, s.referrer, s.submitted_at,
               f.workspace_id, f.title as form_title
        FROM submissions s
        JOIN forms f ON s.form_id = f.id
        WHERE s.id = ? AND s.form_id = ? AND f.workspace_id = ? AND f.deleted_at IS NULL
      `)
        .bind(submissionId, formId, workspaceId)
        .first() as any; // Cast to any for now, will be mapped to Submission type

      if (!submission) {
        return c.json({
          success: false,
          error: 'Submission not found or access denied',
        }, 404);
      }

      // 2. Fetch associated file metadata
      interface FileDbRow {
        id: string;
        workspace_id: string;
        original_name: string;
        file_name: string;
        mime_type: string;
        size: number;
        uploaded_by: string;
        uploaded_at: number;
        submission_id: string;
      }

      const fileRows = await getDb(c.env).prepare(`
        SELECT id, workspace_id, original_name, file_name, mime_type, size, uploaded_by, uploaded_at, submission_id
        FROM files
        WHERE submission_id = ? AND workspace_id = ?
      `)
        .bind(submissionId, workspaceId)
        .all() as { results: FileDbRow[] };

      // 3. Generate signed URLs for each file and map to camelCase File type
      const filesWithUrls: File[] = await Promise.all(
        fileRows.results.map(async (fileRow) => {
          const url = await getSignedFileUrl(
            c.env.FILE_UPLOADS,
            fileRow.file_name,
            fileRow.original_name
          );
          return {
            id: fileRow.id,
            workspaceId: fileRow.workspace_id,
            originalName: fileRow.original_name,
            fileName: fileRow.file_name,
            mimeType: fileRow.mime_type,
            size: fileRow.size,
            uploadedBy: fileRow.uploaded_by,
            uploadedAt: fileRow.uploaded_at,
            submissionId: fileRow.submission_id,
            url,
          } as File;
        })
      );

      // 4. Construct final response
      return c.json({
        success: true,
        data: {
          id: submission.id,
          formId: submission.form_id,
          formVersionId: submission.form_version_id,
          workspaceId: submission.workspace_id,
          formTitle: submission.form_title,
          data: JSON.parse(submission.data as string),
          ipAddress: submission.ip_address,
          userAgent: submission.user_agent,
          referrer: submission.referrer,
          submittedAt: submission.submitted_at,
          files: filesWithUrls,
        } as Submission & { formTitle: string }, // Cast to ensure type safety with extra field
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

/**
 * DELETE /api/forms/:formId/submissions/:submissionId - Delete submission
 */
submissions.delete(
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

      // Verify form exists and belongs to workspace
      const form = await getDb(c.env).prepare(
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

      // Check if submission exists
      const submission = await getDb(c.env).prepare(
        'SELECT id, data FROM submissions WHERE id = ? AND form_id = ?'
      )
        .bind(submissionId, formId)
        .first();

      if (!submission) {
        return c.json({
          success: false,
          error: 'Submission not found',
        }, 404);
      }

      // Delete submission (soft delete or hard delete based on role)
      // Currently doing hard delete. Could change to soft delete if needed.
      await getDb(c.env).prepare(
        'DELETE FROM submissions WHERE id = ? AND form_id = ?'
      )
        .bind(submissionId, formId)
        .run();

      return c.json({
        success: true,
        message: 'Submission deleted successfully',
      });

    } catch (error) {
      console.error('[Delete Submission Error]', error);
      return c.json({
        success: false,
        error: 'Failed to delete submission',
      }, 500);
    }
  }
);

/**
 * Webhook payload type
 */
interface WebhookPayload {
  id: string;
  formId: string;
  workspaceId: string;
  data: Record<string, any>;
  submittedAt: number;
  ipAddress: string;
  userAgent: string;
  referrer: string | null;
}

/**
 * Trigger webhooks for a form submission
 * TODO: Implement when webhooks table and delivery system are ready
 */
async function triggerWebhooks(
  env: Env,
  formId: string,
  payload: WebhookPayload
): Promise<void> {
  console.log(`[Webhook] Would trigger webhooks for form ${formId}`, {
    submissionId: payload.id,
    timestamp: new Date(payload.submittedAt).toISOString(),
  });

  // TODO: Query webhooks table for configured webhooks
  // TODO: Send POST requests to webhook URLs with signature
  // TODO: Implement retry logic and delivery tracking
  // TODO: For now, this is a no-op placeholder
}

/**
 * Email notification payload type
 */
interface NotificationPayload {
  id: string;
  formId: string;
  workspaceId: string;
  data: Record<string, any>;
  submittedAt: number;
}

/**
 * Send email notifications for a form submission
 */
async function sendNotificationEmails(
  env: Env,
  formId: string,
  payload: NotificationPayload
): Promise<void> {
  // Import the actual implementation
  const { sendSubmissionNotification } = await import('./emailNotifications');
  await sendSubmissionNotification(env, formId, payload.data);
}

export default submissions;
