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

      const [
        totalSubmissionsResult,
        submissionRateResult,
      ] = await db.batch([
        totalSubmissionsQuery,
        submissionRateQuery,
      ]);

      const totalSubmissions = (totalSubmissionsResult.results[0] as { totalSubmissions: number })?.totalSubmissions ?? 0;
      const submissionRate = submissionRateResult.results as { date: string; count: number }[];

      const analyticsData: AnalyticsResponse = {
        totalSubmissions,
        // Placeholder: Assume all submissions are complete for now
        completionRate: 1.0,
        // Placeholder: Time tracking schema not defined
        averageTime: 120,
        // Placeholder: View tracking is a separate task
        views: [],
        submissionRate,
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