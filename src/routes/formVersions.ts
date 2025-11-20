import { Hono } from 'hono';
import { z } from 'zod';
import { Env, FormVersionListItem, FormVersion, HonoContext } from '../types/index';
import { getDb } from '../db/db';
import { authMiddleware } from '../middleware/auth';

// Generate random ID (simple implementation)
const generateId = (): string => {
  return crypto.randomUUID();
};
import { zValidator } from '@hono/zod-validator';
import {
  formIdParamSchema,
  FormIdParam,
  formVersionIdParamSchema,
  FormVersionIdParam,
  listFormVersionsQuerySchema,
  ListFormVersionsQuery
} from '../utils/validation';

const formVersionsRouter = new Hono<{
  Bindings: Env;
  Variables: HonoContext;
}>();

const createFormVersionBodySchema = z.object({
  version_notes: z.string().max(500).optional(),
});

type CreateFormVersionBody = z.infer<typeof createFormVersionBodySchema>;

// POST /api/forms/:id/versions - Create a new version for a form
formVersionsRouter.post(
  '/forms/:id/versions',
  authMiddleware,
  zValidator('param', formIdParamSchema),
  zValidator('json', createFormVersionBodySchema),
  async (c) => {
    const { id: formId } = c.req.valid('param') as FormIdParam;
    const { version_notes } = c.req.valid('json') as CreateFormVersionBody;
    const workspaceId = c.get('workspaceId');
    const db = getDb(c.env);

    if (!workspaceId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      // 1. Fetch current form data and check authorization
      const formQuery = db
        .prepare(
          `SELECT form_schema, version_number
           FROM forms
           WHERE id = ?1 AND workspace_id = ?2`
        )
        .bind(formId, workspaceId);

      const formResult = await formQuery.first<{
        form_schema: string;
        version_number: number;
      }>();

      if (!formResult) {
        return c.json({ error: 'Form not found or unauthorized' }, 404);
      }

      const { form_schema, version_number: currentVersionNumber } = formResult;
      const newVersionNumber = currentVersionNumber + 1;
      const newVersionId = generateId();
      const now = new Date().toISOString();

      // 2. Prepare D1 batch for atomic operation
      const insertVersionStmt = db.prepare(
        `INSERT INTO form_versions (
          id,
          form_id,
          version_number,
          form_schema,
          version_notes,
          created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      ).bind(
        newVersionId,
        formId,
        newVersionNumber,
        form_schema,
        version_notes || null,
        now
      );

      const updateFormStmt = db.prepare(
        `UPDATE forms
         SET version_number = ?1, updated_at = ?2
         WHERE id = ?3`
      ).bind(newVersionNumber, Date.now(), formId);

      // 3. Execute batch
      await db.batch([insertVersionStmt, updateFormStmt]);

      // 4. Construct and return the new FormVersion object
      const newFormVersion: FormVersion = {
        id: newVersionId,
        form_id: formId,
        version_number: newVersionNumber,
        form_schema: form_schema,
        created_at: now,
        is_active: 1, // Assuming the latest version is the active one
        version_notes: version_notes || null,
      };

      return c.json(newFormVersion, 201);
    } catch (error) {
      console.error('Error creating new form version:', error);
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  }
);

// GET /api/forms/:id/versions - List all versions for a form with cursor-based pagination
formVersionsRouter.get(
  '/forms/:id/versions',
  authMiddleware,
  zValidator('param', formIdParamSchema),
  zValidator('query', listFormVersionsQuerySchema),
  async (c) => {
    const { id: formId } = c.req.valid('param') as FormIdParam;
    const { limit, cursor } = c.req.valid('query') as ListFormVersionsQuery;
    const workspaceId = c.get('workspaceId');
    const db = getDb(c.env);

    if (!workspaceId) {
      // This should be caught by auth middleware, but as a safeguard
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      // 1. Check if the form exists and belongs to the workspace
      // This implicitly checks for form existence and authorization
      const formCheck = await db
        .prepare('SELECT id FROM forms WHERE id = ?1 AND workspace_id = ?2')
        .bind(formId, workspaceId)
        .first();

      if (!formCheck) {
        return c.json({ error: 'Form not found or unauthorized' }, 404);
      }

      // 2. Construct the base query and parameters
      let query = `
        SELECT
          id,
          form_id,
          version_number,
          created_at,
          version_notes
        FROM form_versions
        WHERE form_id = ?1
      `;
      const params: (string | number)[] = [formId];
      let paramIndex = 2;

      if (cursor) {
        // Subquery to find the version_number of the cursor ID
        query += ` AND version_number < (SELECT version_number FROM form_versions WHERE id = ?${paramIndex++})`;
        params.push(cursor);
      }

      // Add ordering and limit (fetch limit + 1 to check for next page)
      query += ` ORDER BY version_number DESC LIMIT ?${paramIndex++}`;
      params.push(limit + 1); // Fetch one extra item to determine if there's a next page

      // 3. Execute the query
      const versions = await db
        .prepare(query)
        .bind(...params)
        .all<FormVersionListItem>();

      // 4. Determine nextCursor
      const hasNextPage = versions.results.length > limit;
      const results = hasNextPage ? versions.results.slice(0, limit) : versions.results;
      const nextCursor = hasNextPage ? results[results.length - 1].id : null;

      return c.json({
        versions: results,
        nextCursor: nextCursor,
      }, 200);
    } catch (error) {
      console.error('Error fetching form versions:', error);
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  }
);

// GET /api/forms/:id/versions/:versionId - Retrieve a specific form version
formVersionsRouter.get(
  '/forms/:id/versions/:versionId',
  authMiddleware,
  zValidator('param', formVersionIdParamSchema),
  async (c) => {
    const { id: formId, versionId } = c.req.valid('param') as FormVersionIdParam;
    const workspaceId = c.get('workspaceId');
    const db = getDb(c.env);

    if (!workspaceId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      // Query to retrieve the specific form version, ensuring it belongs to a form
      // that is owned by the authenticated user's workspace.
      const version = await db
        .prepare(
          `SELECT
            fv.*
          FROM form_versions fv
          JOIN forms f ON fv.form_id = f.id
          WHERE fv.id = ?1
            AND fv.form_id = ?2
            AND f.workspace_id = ?3`
        )
        .bind(versionId, formId, workspaceId)
        .first<FormVersion>();

      if (!version) {
        return c.json({ error: 'Form version not found or unauthorized' }, 404);
      }

      return c.json(version, 200);
    } catch (error) {
      console.error('Error fetching form version:', error);
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  }
);

// POST /api/forms/:id/versions/:versionId/restore - Restore a previous version of a form
formVersionsRouter.post(
  '/forms/:id/versions/:versionId/restore',
  authMiddleware,
  zValidator('param', formVersionIdParamSchema),
  async (c) => {
    const { id: formId, versionId } = c.req.valid('param') as FormVersionIdParam;
    const workspaceId = c.get('workspaceId');
    const db = getDb(c.env);

    if (!workspaceId) {
      return c.json({ error: 'Unauthorized' }, 401);
    }

    try {
      // Step 1: Fetch Version to Restore
      const versionToRestoreQuery = db
        .prepare(
          `SELECT form_schema, version_number
           FROM form_versions
           WHERE id = ?1 AND form_id = ?2`
        )
        .bind(versionId, formId);

      const versionToRestoreResult = await versionToRestoreQuery.first<{
        form_schema: string;
        version_number: number;
      }>();

      if (!versionToRestoreResult) {
        return c.json({ error: 'Form version not found' }, 404);
      }

      const { form_schema: restoredSchema, version_number: restoredVersionNumber } = versionToRestoreResult;

      // Step 2: Fetch Current Form Data (for authorization and new version number calculation)
      const formQuery = db
        .prepare(
          `SELECT version_number
           FROM forms
           WHERE id = ?1 AND workspace_id = ?2`
        )
        .bind(formId, workspaceId);

      const formResult = await formQuery.first<{
        version_number: number;
      }>();

      if (!formResult) {
        return c.json({ error: 'Form not found or unauthorized' }, 404);
      }

      const { version_number: currentVersionNumber } = formResult;
      const newVersionNumber = currentVersionNumber + 1;
      const newVersionId = generateId();
      const now = new Date().toISOString();

      // Step 3: Create New Version Record (preserves history)
      const insertVersionStmt = db.prepare(
        `INSERT INTO form_versions (
          id,
          form_id,
          version_number,
          form_schema,
          version_notes,
          created_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      ).bind(
        newVersionId,
        formId,
        newVersionNumber,
        restoredSchema,
        `Restored from version ${restoredVersionNumber}`, // Auto-generated note
        now
      );

      // Step 4: Update Form's Current State
      const updateFormStmt = db.prepare(
        `UPDATE forms
         SET form_schema = ?1, version_number = ?2, updated_at = ?3
         WHERE id = ?4`
      ).bind(restoredSchema, newVersionNumber, Date.now(), formId);

      // Atomicity: Execute batch
      await db.batch([insertVersionStmt, updateFormStmt]);

      // Response: Construct and return the new FormVersion object
      const newFormVersion: FormVersion = {
        id: newVersionId,
        form_id: formId,
        version_number: newVersionNumber,
        form_schema: restoredSchema,
        created_at: now,
        is_active: 1,
        version_notes: `Restored from version ${restoredVersionNumber}`,
      };

      return c.json(newFormVersion, 200);
    } catch (error) {
      console.error('Error restoring form version:', error);
      return c.json({ error: 'Internal Server Error' }, 500);
    }
  }
);

export default formVersionsRouter;
