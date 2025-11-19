import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import {
  createFormSchema,
  listFormsQuerySchema,
  updateFormSchema,
  updateFormStatusSchema,
  CreateFormInput,
  UpdateFormInput,
  UpdateFormStatusInput,
  ListFormsQuery
} from '../utils/validation';
import type { HonoContext } from '../types/index';

// Generate random ID (simple implementation)
const generateId = (): string => {
  return crypto.randomUUID();
};

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

// Create forms router
const forms = new Hono<{
  Bindings: Env;
  Variables: HonoContext;
}>();

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
 * POST /forms - Create new form
 */
forms.post(
  '/',
  authMiddleware,
  zValidator('json', createFormSchema),
  async (c) => {
    const body: CreateFormInput = c.req.valid('json');
    const workspaceId = c.get('workspaceId')!;

    // Check workspace membership
    const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
    if (membershipCheck instanceof Response) return membershipCheck;

    const { userId } = membershipCheck;

    try {
      const now = Date.now();
      const formId = generateId();

      // Insert form into database
      await c.env.DB.prepare(`
        INSERT INTO forms (id, workspace_id, title, description, schema, status, version, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          formId,
          workspaceId,
          body.title,
          body.description || null,
          JSON.stringify(body.schema),
          body.status,
          1, // Initial version
          userId,
          now,
          now
        )
        .run();

      // Return created form
      return c.json({
        success: true,
        data: {
          id: formId,
          workspaceId,
          title: body.title,
          description: body.description,
          schema: body.schema,
          status: body.status,
          version: 1,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        },
        message: 'Form created successfully',
      }, 201);

    } catch (error) {
      console.error('[Create Form Error]', error);

      return c.json({
        success: false,
        error: 'Failed to create form',
      }, 500);
    }
  }
);

/**
 * GET /forms - List forms with pagination, filtering, and sorting
 */
forms.get(
  '/',
  authMiddleware,
  zValidator('query', listFormsQuerySchema),
  async (c) => {
    const query: ListFormsQuery = c.req.valid('query');
    const workspaceId = c.get('workspaceId')!;

    // Check workspace membership
    const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
    if (membershipCheck instanceof Response) return membershipCheck;

    try {
      // Build WHERE conditions
      const conditions: string[] = ['workspace_id = ?'];
      const params: any[] = [workspaceId];

      if (query.status) {
        conditions.push('status = ?');
        params.push(query.status);
      }

      if (query.search) {
        conditions.push('(title LIKE ? OR description LIKE ?)');
        const searchPattern = `%${query.search}%`;
        params.push(searchPattern, searchPattern);
      }

      // Pagination cursor
      if (query.cursor) {
        const decodedCursor = atob(query.cursor);
        const cursorValues = decodedCursor.split('|');
        if (cursorValues.length === 2) {
          const cursorTimestamp = parseInt(cursorValues[0]);
          const cursorId = cursorValues[1];
          conditions.push('(created_at < ? OR (created_at = ? AND id < ?))');
          params.push(cursorTimestamp, cursorTimestamp, cursorId);
        }
      }

      // Build ORDER BY
      const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC';
      let orderBy = 'created_at';
      let orderDirection = sortOrder;

      switch (query.sortBy) {
        case 'updated_at':
          orderBy = 'updated_at';
          break;
        case 'title':
          orderBy = 'title';
          orderDirection = sortOrder;
          break;
        default:
          orderBy = 'created_at';
      }

      // Execute query
      const limit = query.limit || 50;
      const whereClause = conditions.join(' AND ');

      const forms = await c.env.DB.prepare(`
        SELECT id, workspace_id, title, description, schema, status, version, created_by, created_at, updated_at
        FROM forms
        WHERE ${whereClause} AND deleted_at IS NULL
        ORDER BY ${orderBy} ${orderDirection}
        LIMIT ?
      `)
        .bind(...params, limit + 1) // +1 to check if there's a next page
        .all();

      // Parse schema and check for next page
      let hasNextPage = false;
      const results = forms.results.map(row => {
        hasNextPage = forms.results.length > limit; // Set on last iteration
        return {
          id: row.id,
          workspaceId: row.workspace_id,
          title: row.title,
          description: row.description,
          schema: JSON.parse(row.schema as string),
          status: row.status,
          version: row.version,
          createdBy: row.created_by,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
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
        const cursorValue = query.sortBy === 'title'
          ? `${lastResult.title}|${lastResult.id}`
          : `${lastResult.createdAt}|${lastResult.id}`;
        nextCursor = btoa(cursorValue);
      }

      return c.json({
        success: true,
        data: {
          forms: results,
          pagination: {
            hasNextPage,
            nextCursor,
            limit: results.length,
          },
        },
      });

    } catch (error) {
      console.error('[List Forms Error]', error);

      return c.json({
        success: false,
        error: 'Failed to list forms',
      }, 500);
    }
  }
);

/**
 * GET /forms/:id - Get single form with caching
 */
forms.get(
  '/:id',
  authMiddleware,
  async (c) => {
    const formId = c.req.param('id');
    const workspaceId = c.get('workspaceId')!;

    // Check workspace membership
    const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
    if (membershipCheck instanceof Response) return membershipCheck;

    try {
      // Try cache first for published forms
      const cacheKey = `form:${formId}`;
      const cachedForm = await c.env.FORM_CACHE.get(cacheKey, 'json') as any;

      if (cachedForm && cachedForm.workspaceId === workspaceId) {
        return c.json({
          success: true,
          data: cachedForm,
          cached: true,
        });
      }

      // Fetch from database
      const form = await c.env.DB.prepare(`
        SELECT id, workspace_id, title, description, schema, status, version, created_by, created_at, updated_at
        FROM forms
        WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL
      `)
        .bind(formId, workspaceId)
        .first();

      if (!form) {
        return c.json({
          success: false,
          error: 'Form not found',
        }, 404);
      }

      const formData = {
        id: form.id,
        workspaceId: form.workspace_id,
        title: form.title,
        description: form.description,
        schema: JSON.parse(form.schema as string),
        status: form.status,
        version: form.version,
        createdBy: form.created_by,
        createdAt: form.created_at,
        updatedAt: form.updated_at,
      };

      // Cache published forms for 10 minutes
      if (form.status === 'published') {
        await c.env.FORM_CACHE.put(cacheKey, JSON.stringify(formData), {
          expirationTtl: 600, // 10 minutes
        });
      }

      return c.json({
        success: true,
        data: formData,
        cached: false,
      });

    } catch (error) {
      console.error('[Get Form Error]', error);

      return c.json({
        success: false,
        error: 'Failed to get form',
      }, 500);
    }
  }
);

// Query schemas for submission listing
const listSubmissionsQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50).optional(),
  cursor: z.string().optional(),
  dateFrom: z.coerce.number().optional(), // Unix timestamp
  dateTo: z.coerce.number().optional(),   // Unix timestamp
  search: z.string().optional(), // JSON search in submission data
});

/**
 * GET /forms/:id/submissions - List submissions with pagination and filtering
 */
forms.get(
  '/:id/submissions',
  authMiddleware,
  zValidator('query', listSubmissionsQuerySchema),
  async (c) => {
    const formId = c.req.param('id');
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
 * GET /forms/:id/submissions/:submissionId - Get single submission
 */
forms.get(
  '/:id/submissions/:submissionId',
  authMiddleware,
  async (c) => {
    const formId = c.req.param('id');
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

/**
 * PUT /forms/:id - Update form
 */
forms.put(
  '/:id',
  authMiddleware,
  zValidator('json', updateFormSchema),
  async (c) => {
    const formId = c.req.param('id');
    const updateData: UpdateFormInput = c.req.valid('json');
    const workspaceId = c.get('workspaceId')!;

    try {
      // Check workspace membership and fetch form
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const { role } = membershipCheck;

      // Get current form data
      const currentForm = await c.env.DB.prepare(
        'SELECT title, description, schema, status, version FROM forms WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL'
      )
        .bind(formId, workspaceId)
        .first();

      if (!currentForm) {
        return c.json({
          success: false,
          error: 'Form not found or access denied',
        }, 404);
      }

      // Build update query dynamically
      const updateFields: string[] = [];
      const updateParams: any[] = [];
      const now = Date.now();

      if (updateData.title !== undefined) {
        updateFields.push('title = ?');
        updateParams.push(updateData.title);
      }

      if (updateData.description !== undefined) {
        updateFields.push('description = ?');
        updateParams.push(updateData.description);
      }

      if (updateData.schema !== undefined) {
        updateFields.push('schema = ?');
        updateParams.push(JSON.stringify(updateData.schema));
      }

      if (updateData.status !== undefined) {
        // Check permissions for status changes (only owner/admin can publish)
        if ((updateData.status === 'published' || updateData.status === 'archived') && role !== 'owner' && role !== 'admin') {
          return c.json({
            success: false,
            error: 'Insufficient permissions to change form status',
          }, 403);
        }
        updateFields.push('status = ?');
        updateParams.push(updateData.status);
      }

      // Always update version and modified time
      updateFields.push('version = version + 1');
      updateFields.push('updated_at = ?');
      updateParams.push(now);

      // Execute update
      const updateQuery = `UPDATE forms SET ${updateFields.join(', ')} WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL`;
      updateParams.push(formId, workspaceId);

      const result = await c.env.DB.prepare(updateQuery)
        .bind(...updateParams)
        .run();

      if (result.meta.changes === 0) {
        return c.json({
          success: false,
          error: 'Form not found or no changes made',
        }, 404);
      }

      // Invalidate cache if status changed
      if (updateData.status !== undefined) {
        await c.env.FORM_CACHE.delete(`form:${formId}`);
      }

      return c.json({
        success: true,
        message: 'Form updated successfully',
      });

    } catch (error) {
      console.error('[Update Form Error]', error);
      return c.json({
        success: false,
        error: 'Failed to update form',
      }, 500);
    }
  }
);

/**
 * DELETE /forms/:id - Soft delete form
 */
forms.delete(
  '/:id',
  authMiddleware,
  async (c) => {
    const formId = c.req.param('id');
    const workspaceId = c.get('workspaceId')!;

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const { role } = membershipCheck;

      // Check permissions (only owner/admin can delete)
      if (role !== 'owner' && role !== 'admin') {
        return c.json({
          success: false,
          error: 'Insufficient permissions to delete form',
        }, 403);
      }

      // Verify form exists and belongs to workspace
      const form = await c.env.DB.prepare(
        'SELECT status FROM forms WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL'
      )
        .bind(formId, workspaceId)
        .first();

      if (!form) {
        return c.json({
          success: false,
          error: 'Form not found or access denied',
        }, 404);
      }

      // Cannot delete published forms (archive first)
      if (form.status === 'published') {
        return c.json({
          success: false,
          error: 'Cannot delete published form. Archive it first.',
        }, 400);
      }

      // Soft delete the form
      const result = await c.env.DB.prepare(
        'UPDATE forms SET deleted_at = ?, status = ? WHERE id = ? AND workspace_id = ?'
      )
        .bind(Date.now(), 'archived', formId, workspaceId)
        .run();

      if (result.meta.changes === 0) {
        return c.json({
          success: false,
          error: 'Form not found',
        }, 404);
      }

      // Invalidate cache
      await c.env.FORM_CACHE.delete(`form:${formId}`);

      return c.json({
        success: true,
        message: 'Form deleted successfully',
      });

    } catch (error) {
      console.error('[Delete Form Error]', error);
      return c.json({
        success: false,
        error: 'Failed to delete form',
      }, 500);
    }
  }
);

/**
 * POST /forms/:id/duplicate - Duplicate form
 */
forms.post(
  '/:id/duplicate',
  authMiddleware,
  async (c) => {
    const formId = c.req.param('id');
    const workspaceId = c.get('workspaceId')!;

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const { userId } = membershipCheck;

      // Get original form
      const originalForm = await c.env.DB.prepare(`
        SELECT title, description, schema, status
        FROM forms
        WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL
      `)
        .bind(formId, workspaceId)
        .first();

      if (!originalForm) {
        return c.json({
          success: false,
          error: 'Form not found or access denied',
        }, 404);
      }

      // Create duplicate
      const now = Date.now();
      const duplicateId = generateId();
      const duplicateTitle = `${originalForm.title} (Copy)`;

      await c.env.DB.prepare(`
        INSERT INTO forms (id, workspace_id, title, description, schema, status, version, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
        .bind(
          duplicateId,
          workspaceId,
          duplicateTitle,
          originalForm.description,
          originalForm.schema,
          'draft', // Always create as draft
          1,
          userId,
          now,
          now
        )
        .run();

      return c.json({
        success: true,
        data: {
          id: duplicateId,
          workspaceId,
          title: duplicateTitle,
          description: originalForm.description,
          schema: JSON.parse(originalForm.schema as string),
          status: 'draft',
          version: 1,
          createdBy: userId,
          createdAt: now,
          updatedAt: now,
        },
        message: 'Form duplicated successfully',
      }, 201);

    } catch (error) {
      console.error('[Duplicate Form Error]', error);
      return c.json({
        success: false,
        error: 'Failed to duplicate form',
      }, 500);
    }
  }
);

/**
 * PATCH /forms/:id/status - Update form status only
 */
forms.patch(
  '/:id/status',
  authMiddleware,
  zValidator('json', updateFormStatusSchema),
  async (c) => {
    const formId = c.req.param('id');
    const updateData: UpdateFormStatusInput = c.req.valid('json');
    const workspaceId = c.get('workspaceId')!;

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const { userId, role } = membershipCheck;

      // Check permissions for status changes
      if (updateData.status === 'published' && role !== 'owner' && role !== 'admin') {
        return c.json({
          success: false,
          error: 'Insufficient permissions to publish form',
        }, 403);
      }

      // Verify form exists
      const form = await c.env.DB.prepare(
        'SELECT status FROM forms WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL'
      )
        .bind(formId, workspaceId)
        .first();

      if (!form) {
        return c.json({
          success: false,
          error: 'Form not found or access denied',
        }, 404);
      }

      // Prevent invalid status transitions
      if (updateData.status === (form.status as 'draft' | 'published' | 'archived')) {
        return c.json({
          success: false,
          error: 'Status is already set to that value',
        }, 400);
      }

      // Update status and version
      const now = Date.now();
      await c.env.DB.prepare(
        'UPDATE forms SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND workspace_id = ?'
      )
        .bind(updateData.status, now, formId, workspaceId)
        .run();

      // Invalidate cache
      await c.env.FORM_CACHE.delete(`form:${formId}`);

      return c.json({
        success: true,
        message: `Form status updated to ${updateData.status}`,
      });

    } catch (error) {
      console.error('[Update Form Status Error]', error);
      return c.json({
        success: false,
        error: 'Failed to update form status',
      }, 500);
    }
  }
);

export default forms;
