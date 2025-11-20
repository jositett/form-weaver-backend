import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { checkWorkspaceMembership } from './forms';
import type { Env, HonoContext } from '../types/index';
import { getDb } from '../db/db';

interface AnalyticsResponse {
  totalSubmissions: number;
  completionRate: number; // 0.0 to 1.0
  averageTime: number; // seconds
  views: { date: string; count: number }[];
  submissionRate: { date: string; count: number }[];
  fieldAnalytics?: FieldAnalytics;
}

interface FieldAnalytics {
  mostSkippedFields: FieldSkipData[];
  mostErrorFields: FieldErrorData[];
}

interface FieldSkipData {
  fieldId: string;
  fieldLabel?: string;
  skipCount: number;
  skipRate: number; // 0.0 to 1.0
}

interface FieldErrorData {
  fieldId: string;
  fieldLabel?: string;
  errorCount: number;
  errorRate: number; // 0.0 to 1.0
}

/**
 * Calculate field-level analytics for a form
 * Analyzes skip rates and error rates across all submissions
 */
async function calculateFieldAnalytics(
  db: any,
  formId: string,
  formSchema: any[],
  totalSubmissions: number
): Promise<FieldAnalytics> {
  // Get all submissions for analysis
  const submissionsQuery = db.prepare(
    'SELECT data FROM submissions WHERE form_id = ?'
  ).bind(formId);

  const submissions = await submissionsQuery.all();
  const submissionData = submissions.results as { data: string }[];

  if (submissionData.length === 0) {
    return { mostSkippedFields: [], mostErrorFields: [] };
  }

  // Initialize field tracking
  const fieldStats: Record<string, {
    skips: number;
    errors: number; // Placeholder for future error tracking
    field: any;
  }> = {};

  // Initialize stats for each field in form schema
  formSchema.forEach(field => {
    if (field.id) {
      fieldStats[field.id] = {
        skips: 0,
        errors: 0,
        field,
      };
    }
  });

  // Analyze each submission
  submissionData.forEach(submission => {
    try {
      const data = JSON.parse(submission.data);

      // Check each field for skips
      Object.keys(fieldStats).forEach(fieldId => {
        const fieldValue = data[fieldId];

        // Consider field "skipped" if null, undefined, empty string, or empty array
        if (fieldValue === null ||
            fieldValue === undefined ||
            fieldValue === '' ||
            (Array.isArray(fieldValue) && fieldValue.length === 0)) {
          fieldStats[fieldId].skips++;
        }
      });
    } catch (error) {
      console.error('[Submission Parse Error]', error);
    }
  });

  // Convert to arrays and calculate rates
  const mostSkippedFields: FieldSkipData[] = Object.entries(fieldStats)
    .map(([fieldId, stats]) => ({
      fieldId,
      fieldLabel: stats.field.label,
      skipCount: stats.skips,
      skipRate: totalSubmissions > 0 ? stats.skips / totalSubmissions : 0,
    }))
    .sort((a, b) => b.skipRate - a.skipRate) // Sort by highest skip rate first
    .slice(0, 10); // Top 10 most skipped fields

  // For now, mostErrorFields is empty since we don't track validation errors
  // In the future, this could track actual validation failures
  const mostErrorFields: FieldErrorData[] = Object.entries(fieldStats)
    .map(([fieldId, stats]) => ({
      fieldId,
      fieldLabel: stats.field.label,
      errorCount: stats.errors,
      errorRate: totalSubmissions > 0 ? stats.errors / totalSubmissions : 0,
    }))
    .filter(field => field.errorCount > 0) // Only include fields with errors
    .sort((a, b) => b.errorRate - a.errorRate) // Sort by highest error rate first
    .slice(0, 10); // Top 10 problematic fields

  return {
    mostSkippedFields,
    mostErrorFields,
  };
}

// --- Zod Schemas ---

const formIdParamSchema = z.object({
  id: z.string().min(1).max(50), // 'id' is the param name from the parent route
});

// --- Analytics Router ---

const analyticsRouter = new Hono<{
  Bindings: Env;
  Variables: HonoContext;
}>();

/**
 * GET /:id/analytics - Get form analytics
 * (Resolves to /api/forms/:formId/analytics)
 */
analyticsRouter.get(
  '/analytics',
  authMiddleware,
  zValidator('param', formIdParamSchema),
  async (c) => {
    const { id: formId } = c.req.valid('param');
    const workspaceId = c.get('workspaceId')!;

    try {
      // Check workspace membership for the form's workspace
      // NOTE: This assumes the form's workspaceId is the same as the user's current workspaceId.
      // A more robust check would fetch the form first to get its workspaceId.
      // For now, we use the user's workspaceId from the auth middleware.
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const db = getDb(c.env);

      // 1. Total Submissions
      const totalSubmissionsQuery = db.prepare(
        'SELECT COUNT(id) AS totalSubmissions FROM submissions WHERE form_id = ?'
      ).bind(formId);

      // 2. Submission Rate (last 30 days)
      // submitted_at is a Unix timestamp (seconds)
      const submissionRateQuery = db.prepare(`
        SELECT
          strftime('%Y-%m-%d', submitted_at, 'unixepoch') AS date,
          COUNT(id) AS count
        FROM submissions
        WHERE
          form_id = ? AND
          submitted_at >= strftime('%s', 'now', '-30 days')
        GROUP BY date
        ORDER BY date ASC
      `).bind(formId);

      // 3. Get form schema to analyze fields
      const formQuery = db.prepare(
        'SELECT schema FROM forms WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL'
      ).bind(formId, workspaceId);

      const [
        totalSubmissionsResult,
        submissionRateResult,
        formResult,
      ] = await db.batch([
        totalSubmissionsQuery,
        submissionRateQuery,
        formQuery,
      ]);

      const totalSubmissions = (totalSubmissionsResult.results[0] as { totalSubmissions: number })?.totalSubmissions ?? 0;
      const submissionRate = submissionRateResult.results as { date: string; count: number }[];
      const form = formResult.results[0] as { schema: string } | undefined;

      // 4. Field-level analytics (only if we have submissions and form schema)
      let fieldAnalytics: FieldAnalytics | undefined;

      if (totalSubmissions > 0 && form?.schema) {
        try {
          const formSchema = JSON.parse(form.schema) as any[];
          fieldAnalytics = await calculateFieldAnalytics(db, formId, formSchema, totalSubmissions);
        } catch (error) {
          console.error('[Field Analytics Error]', error);
          // Continue without field analytics if there's an error
        }
      }

      const analyticsData: AnalyticsResponse = {
        totalSubmissions,
        // Placeholder: Assume all submissions are complete for now
        completionRate: 1.0,
        // Placeholder: Time tracking schema not defined
        averageTime: 120,
        // Placeholder: View tracking is a separate task
        views: [],
        submissionRate,
        fieldAnalytics,
      };

      return c.json<AnalyticsResponse>({
        success: true,
        data: analyticsData,
        message: `Analytics for form ${formId} in workspace ${workspaceId}`,
      } as any);

    } catch (error) {
      console.error('[Get Form Analytics Error]', error);
      return c.json({
        success: false,
        error: 'Failed to get form analytics',
      }, 500);
    }
  }
);

export default analyticsRouter;
