import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { checkWorkspaceMembership } from '../utils/workspace';
import { getDb } from '../db/db';
import type { Env } from '../types';

type Variables = {
  userId: string;
  workspaceId: string;
};

const exports = new Hono<{ Bindings: Env; Variables: Variables }>();

const exportQuerySchema = z.object({
  format: z.enum(['csv', 'json']).default('csv'),
  dateFrom: z.coerce.number().optional(),
  dateTo: z.coerce.number().optional(),
});

exports.use('*', authMiddleware);

/**
 * Generate CSV from submissions
 */
function generateCSV(submissions: any[], formSchema: any[]): string {
  if (submissions.length === 0) {
    return 'No submissions found';
  }

  // Extract all unique field IDs from form schema
  const fieldIds = formSchema.map(field => field.id);
  const fieldLabels = formSchema.reduce((acc, field) => {
    acc[field.id] = field.label || field.id;
    return acc;
  }, {} as Record<string, string>);

  // CSV header
  const headers = ['Submission ID', 'Submitted At', 'IP Address', ...fieldIds.map(id => fieldLabels[id])];
  const csvRows = [headers.join(',')];

  // CSV rows
  for (const submission of submissions) {
    const data = JSON.parse(submission.data);
    const row = [
      submission.id,
      new Date(submission.submitted_at).toISOString(),
      submission.ip_address || '',
      ...fieldIds.map(fieldId => {
        const value = data[fieldId];
        if (value === null || value === undefined) return '';
        // Escape CSV values
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      })
    ];
    csvRows.push(row.join(','));
  }

  return csvRows.join('\n');
}

/**
 * Generate JSON from submissions
 */
function generateJSON(submissions: any[]): string {
  const formatted = submissions.map(submission => ({
    id: submission.id,
    formId: submission.form_id,
    data: JSON.parse(submission.data),
    submittedAt: new Date(submission.submitted_at).toISOString(),
    ipAddress: submission.ip_address,
    userAgent: submission.user_agent,
    referrer: submission.referrer,
  }));

  return JSON.stringify(formatted, null, 2);
}

/**
 * GET /api/forms/:id/submissions/export - Export submissions
 */
exports.get(
  '/:id/submissions/export',
  zValidator('query', exportQuerySchema),
  async (c) => {
    const formId = c.req.param('id');
    const workspaceId = c.get('workspaceId');
    const { format, dateFrom, dateTo } = c.req.valid('query');

    try {
      const membershipResult = await checkWorkspaceMembership(c, workspaceId);
      if (membershipResult instanceof Response) {
        return membershipResult;
      }

      // Get form and verify access
      const form = await getDb(c.env).prepare(
        'SELECT id, title, schema, workspace_id FROM forms WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL'
      ).bind(formId, workspaceId).first();

      if (!form) {
        return c.json({ error: 'Form not found' }, 404);
      }

      // Build query conditions
      const conditions: string[] = ['form_id = ?'];
      const params: any[] = [formId];

      if (dateFrom) {
        conditions.push('submitted_at >= ?');
        params.push(dateFrom);
      }
      if (dateTo) {
        conditions.push('submitted_at <= ?');
        params.push(dateTo);
      }

      // Fetch submissions
      const result = await getDb(c.env).prepare(`
        SELECT id, form_id, data, submitted_at, ip_address, user_agent, referrer
        FROM submissions
        WHERE ${conditions.join(' AND ')}
        ORDER BY submitted_at DESC
      `).bind(...params).all();

      if (result.results.length === 0) {
        return c.json({ error: 'No submissions found' }, 404);
      }

      // Parse form schema
      const formSchema = JSON.parse(form.schema as string);

      // Generate export based on format
      let content: string;
      let contentType: string;
      let filename: string;

      if (format === 'csv') {
        content = generateCSV(result.results, formSchema);
        contentType = 'text/csv';
        filename = `${form.title || 'form'}-submissions-${Date.now()}.csv`;
      } else {
        content = generateJSON(result.results);
        contentType = 'application/json';
        filename = `${form.title || 'form'}-submissions-${Date.now()}.json`;
      }

      // Return file as download
      return c.body(content, 200, {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(new TextEncoder().encode(content).length),
      });

    } catch (error) {
      console.error('[Export Error]', error);
      return c.json({ error: 'Failed to export submissions' }, 500);
    }
  }
);

export { exports };
export default exports;
