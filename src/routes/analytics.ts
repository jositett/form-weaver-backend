import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { checkWorkspaceMembership } from '../utils/workspace';
import type { Env, HonoContext } from '../types/index';
import { getDb } from '../db/db';

interface AnalyticsResponse {
  totalSubmissions: number;
  completionRate: number; // 0.0 to 1.0
  averageTime: number; // seconds
  views: { date: string; count: number }[];
  submissionRate: { date: string; count: number }[];
  fieldAnalytics?: FieldAnalytics;
  peakSubmissionTimes?: PeakSubmissionTimes;
}

interface PeakSubmissionTimes {
  hourlyDistribution: HourlyData[];
  peakHour: number; // 0-23
  peakHourCount: number;
}

interface HourlyData {
  hour: number; // 0-23
  count: number;
  percentage: number; // 0.0 to 1.0
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

const analyticsQuerySchema = z.object({
  dateFrom: z.coerce.number().optional(), // Unix timestamp (milliseconds)
  dateTo: z.coerce.number().optional(),   // Unix timestamp (milliseconds)
  includeFieldAnalytics: z.coerce.boolean().default(true).optional(), // Enable field-level analytics
});

// --- Analytics Router ---

const analyticsRouter = new Hono<{
  Bindings: Env;
  Variables: HonoContext;
}>();

/**
 * GET /:id/analytics/views - Get form views analytics
 * (Resolves to /api/forms/:formId/analytics/views)
 */
analyticsRouter.get(
  '/analytics/views',
  authMiddleware,
  zValidator('param', formIdParamSchema),
  zValidator('query', analyticsQuerySchema),
  async (c) => {
    const { id: formId } = c.req.valid('param');
    const query = c.req.valid('query');
    const workspaceId = c.get('workspaceId')!;

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const db = getDb(c.env);

      // Convert milliseconds to seconds for SQLite timestamp comparison
      const dateFromSeconds = query.dateFrom ? Math.floor(query.dateFrom / 1000) : undefined;
      const dateToSeconds = query.dateTo ? Math.floor(query.dateTo / 1000) : undefined;

      // Build query for form views with optional date range
      let viewsQuery;
      if (dateFromSeconds || dateToSeconds) {
        let conditions = ['form_id = ?'];
        const params = [formId];

        if (dateFromSeconds) {
          conditions.push('viewed_at >= ?');
          params.push(String(dateFromSeconds));
        }

        if (dateToSeconds) {
          conditions.push('viewed_at <= ?');
          params.push(String(dateToSeconds));
        }

        const whereClause = conditions.join(' AND ');
        viewsQuery = db.prepare(`
          SELECT
            strftime('%Y-%m-%d', viewed_at, 'unixepoch') AS date,
            COUNT(id) AS count
          FROM form_views
          WHERE ${whereClause}
          GROUP BY date
          ORDER BY date ASC
        `).bind(...params.map(p => String(p)));
      } else {
        // Default: last 30 days
        viewsQuery = db.prepare(`
          SELECT
            strftime('%Y-%m-%d', viewed_at, 'unixepoch') AS date,
            COUNT(id) AS count
          FROM form_views
          WHERE
            form_id = ? AND
            viewed_at >= strftime('%s', 'now', '-30 days')
          GROUP BY date
          ORDER BY date ASC
        `).bind(formId);
      }

      // Get total views count
      const totalViewsQuery = db.prepare(
        'SELECT COUNT(id) AS totalViews FROM form_views WHERE form_id = ?'
      ).bind(formId);

      const [viewsResult, totalViewsResult] = await db.batch([
        viewsQuery,
        totalViewsQuery,
      ]);

      const views = viewsResult.results as { date: string; count: number }[];
      const totalViews = (totalViewsResult.results[0] as { totalViews: number })?.totalViews ?? 0;

      return c.json({
        success: true,
        data: {
          totalViews,
          views,
        },
        message: `Form views analytics for form ${formId}`,
      });

    } catch (error) {
      console.error('[Get Form Views Error]', error);
      return c.json({
        success: false,
        error: 'Failed to get form views analytics',
      }, 500);
    }
  }
);

/**
 * GET /:id/analytics - Get form analytics
 * (Resolves to /api/forms/:formId/analytics)
 */
analyticsRouter.get(
  '/analytics',
  authMiddleware,
  zValidator('param', formIdParamSchema),
  zValidator('query', analyticsQuerySchema),
  async (c) => {
    const { id: formId } = c.req.valid('param');
    const query = c.req.valid('query');
    const workspaceId = c.get('workspaceId')!;

    try {
      // Check workspace membership for the form's workspace
      // NOTE: This assumes the form's workspaceId is the same as the user's current workspaceId.
      // A more robust check would fetch the form first to get its workspaceId.
      // For now, we use the user's workspaceId from the auth middleware.
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const db = getDb(c.env);

      // Generate cache key based on formId and query parameters
      const cacheKey = `analytics:${formId}:${query.dateFrom || 'default'}:${query.dateTo || 'default'}:${query.includeFieldAnalytics}`;

      // Try to get cached analytics data first (1 hour TTL)
      try {
        const cachedAnalytics = await c.env.ANALYTICS_CACHE.get(cacheKey, 'json') as AnalyticsResponse | null;
        if (cachedAnalytics) {
          return c.json<AnalyticsResponse>({
            success: true,
            data: cachedAnalytics,
            message: `Analytics for form ${formId} in workspace ${workspaceId} (cached)`,
            cached: true,
          } as any);
        }
      } catch (cacheError) {
        // Continue without caching if KV is unavailable
        console.warn('[Analytics Cache Error]', cacheError);
      }

      // Convert milliseconds to seconds for SQLite timestamp comparison
      const dateFromSeconds = query.dateFrom ? Math.floor(query.dateFrom / 1000) : undefined;
      const dateToSeconds = query.dateTo ? Math.floor(query.dateTo / 1000) : undefined;

      // 1. Total Submissions (with optional date range filtering)
      let totalSubmissionsQuery;
      let submissionRateQuery;

      if (dateFromSeconds || dateToSeconds) {
        // Build conditional query for total submissions with date range
        let conditions = ['form_id = ?'];
        const params = [formId];

        if (dateFromSeconds) {
          conditions.push('submitted_at >= ?');
          params.push(String(dateFromSeconds));
        }

        if (dateToSeconds) {
          conditions.push('submitted_at <= ?');
          params.push(String(dateToSeconds));
        }

        const whereClause = conditions.join(' AND ');
        totalSubmissionsQuery = db.prepare(
          `SELECT COUNT(id) AS totalSubmissions FROM submissions WHERE ${whereClause}`
        ).bind(...params.map(p => String(p)));

        // 2. Submission Rate with date range filtering
        let dateConditions = ['form_id = ?'];
        const dateParams = [formId];

        if (dateFromSeconds) {
          dateConditions.push('submitted_at >= ?');
          dateParams.push(String(dateFromSeconds));
        }

        if (dateToSeconds) {
          dateConditions.push('submitted_at <= ?');
          dateParams.push(String(dateToSeconds));
        }

        const dateWhereClause = dateConditions.join(' AND ');
        submissionRateQuery = db.prepare(`
          SELECT
            strftime('%Y-%m-%d', submitted_at, 'unixepoch') AS date,
            COUNT(id) AS count
          FROM submissions
          WHERE ${dateWhereClause}
          GROUP BY date
          ORDER BY date ASC
        `).bind(...dateParams.map(p => String(p)));
      } else {
        // Default behavior: all submissions, last 30 days for submission rate
        totalSubmissionsQuery = db.prepare(
          'SELECT COUNT(id) AS totalSubmissions FROM submissions WHERE form_id = ?'
        ).bind(formId);

        submissionRateQuery = db.prepare(`
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
      }

      // 3. Get form schema to analyze fields
      const formQuery = db.prepare(
        'SELECT schema FROM forms WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL'
      ).bind(formId, workspaceId);

      // 4. Get total views for completion rate calculation
      const totalViewsQuery = db.prepare(
        'SELECT COUNT(id) AS totalViews FROM form_views WHERE form_id = ?'
      ).bind(formId);

      // 5. Calculate average time (completion time)
      const averageTimeQuery = db.prepare(`
        SELECT
          AVG(
            CASE
              WHEN started_at IS NOT NULL THEN (submitted_at - started_at)
              ELSE NULL
            END
          ) AS averageCompletionTime,
          COUNT(CASE WHEN started_at IS NOT NULL THEN 1 END) AS submissionsWithStartTime
        FROM submissions
        WHERE form_id = ?
      `).bind(formId);

      // 6. Peak submission times - hourly distribution
      let peakSubmissionTimesQuery;
      if (dateFromSeconds || dateToSeconds) {
        // Build conditional query for peak submission times with date range
        let conditions = ['form_id = ?'];
        const params = [formId];

        if (dateFromSeconds) {
          conditions.push('submitted_at >= ?');
          params.push(String(dateFromSeconds));
        }

        if (dateToSeconds) {
          conditions.push('submitted_at <= ?');
          params.push(String(dateToSeconds));
        }

        const whereClause = conditions.join(' AND ');
        peakSubmissionTimesQuery = db.prepare(`
          SELECT
            strftime('%H', submitted_at, 'unixepoch') AS hour,
            COUNT(id) AS count
          FROM submissions
          WHERE ${whereClause}
          GROUP BY hour
          ORDER BY hour ASC
        `).bind(...params.map(p => String(p)));
      } else {
        // Default: all submissions for hourly analysis
        peakSubmissionTimesQuery = db.prepare(`
          SELECT
            strftime('%H', submitted_at, 'unixepoch') AS hour,
            COUNT(id) AS count
          FROM submissions
          WHERE form_id = ?
          GROUP BY hour
          ORDER BY hour ASC
        `).bind(formId);
      }

      const [
        totalSubmissionsResult,
        submissionRateResult,
        formResult,
        totalViewsResult,
        averageTimeResult,
        peakSubmissionTimesResult,
      ] = await db.batch([
        totalSubmissionsQuery,
        submissionRateQuery,
        formQuery,
        totalViewsQuery,
        averageTimeQuery,
        peakSubmissionTimesQuery,
      ]);

      const totalSubmissions = (totalSubmissionsResult.results[0] as { totalSubmissions: number })?.totalSubmissions ?? 0;
      const submissionRate = submissionRateResult.results as { date: string; count: number }[];
      const form = formResult.results[0] as { schema: string } | undefined;
      const totalViews = (totalViewsResult.results[0] as { totalViews: number })?.totalViews ?? 0;
      const averageTimeData = averageTimeResult.results[0] as {
        averageCompletionTime: number | null;
        submissionsWithStartTime: number;
      };
      const peakSubmissionTimesRaw = peakSubmissionTimesResult.results as { hour: string; count: number }[];

      // 7. Peak submission times analysis
      let peakSubmissionTimes: PeakSubmissionTimes | undefined;

      if (totalSubmissions > 0) {
        try {
          // Process hourly distribution data
          const hourlyDistribution: HourlyData[] = [];
          
          // Create a map for quick lookup of hourly counts
          const hourlyMap = new Map<number, number>();
          peakSubmissionTimesRaw.forEach(item => {
            const hour = parseInt(item.hour, 10);
            hourlyMap.set(hour, item.count);
          });

          // Generate complete 24-hour distribution (0-23)
          for (let hour = 0; hour < 24; hour++) {
            const count = hourlyMap.get(hour) || 0;
            const percentage = totalSubmissions > 0 ? count / totalSubmissions : 0;
            
            hourlyDistribution.push({
              hour,
              count,
              percentage,
            });
          }

          // Find peak hour
          const peakHourData = hourlyDistribution.reduce((max, current) =>
            current.count > max.count ? current : max
          );

          peakSubmissionTimes = {
            hourlyDistribution,
            peakHour: peakHourData.hour,
            peakHourCount: peakHourData.count,
          };
        } catch (error) {
          console.error('[Peak Submission Times Error]', error);
          // Continue without peak submission times if there's an error
        }
      }

      // 8. Field-level analytics (only if we have submissions and form schema)
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

      // 9. Calculate completion rate and average time
      const completionRate = totalViews > 0 ? totalSubmissions / totalViews : 0;
      const averageTime = averageTimeData.averageCompletionTime ?? 120;

      const analyticsData: AnalyticsResponse = {
        totalSubmissions,
        completionRate,
        averageTime,
        // Placeholder: View tracking is a separate task
        views: [],
        submissionRate,
        fieldAnalytics,
        peakSubmissionTimes,
      };

      // Cache the analytics data for 1 hour (3600 seconds)
      try {
        await c.env.ANALYTICS_CACHE.put(cacheKey, JSON.stringify(analyticsData), {
          expirationTtl: 3600, // 1 hour
        });
      } catch (cacheError) {
        // Log cache error but don't fail the request
        console.warn('[Analytics Cache Put Error]', cacheError);
      }

      return c.json<AnalyticsResponse>({
        success: true,
        data: analyticsData,
        message: `Analytics for form ${formId} in workspace ${workspaceId}`,
        cached: false,
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