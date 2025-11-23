import { Hono } from 'hono';
import { TTLManager } from '../utils/cacheTTL';

  /**
   * Determine analytics data type based on date range
   */
  private getAnalyticsDataType(dateFrom?: number, dateTo?: number): 'realtime' | 'daily' | 'weekly' | 'historical' {
    if (!dateFrom || !dateTo) {
      return 'historical';
    }

    const rangeDays = (dateTo - dateFrom) / (1000 * 60 * 60 * 24);
    
    if (rangeDays <= 1) {
      return 'realtime';
    } else if (rangeDays <= 7) {
      return 'daily';
    } else if (rangeDays <= 30) {
      return 'weekly';
    }
    return 'historical';
  }
import { TTLManager } from '../utils/cacheTTL';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { checkWorkspaceMembership } from '../utils/workspace';
import { setCacheHeaders, CACHE_CONFIGS } from '../utils/cache';
import type { Env, HonoContext } from '../types/index';
import { 
  calculateFormAnalytics, 
  calculateCompletionRate, 
  calculateAverageTime,
  getSubmissionRate,
  getPeakSubmissionTimes,
  calculateFieldAnalytics,
  getWorkspaceAnalytics,
  calculateDropoffAnalysis,
  type AnalyticsMetrics,
  type WorkspaceAnalytics,
  type FormDropoffAnalysis
} from '../utils/analytics';
import { getDb } from '../db/db';

interface AnalyticsResponse {
  totalSubmissions: number;
  totalViews: number; // Added totalViews for frontend compatibility
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

interface WorkspaceAnalyticsResponse {
  totalSubmissions: number;
  totalViews: number;
  averageCompletionRate: number;
  totalForms: number;
  activeForms: number;
  submissionTrends: Array<{ date: string; submissions: number; views: number }>;
}

// --- Zod Schemas ---

const formIdParamSchema = z.object({
  id: z.string().min(1).max(50), // 'id' is the param name from the parent route
});

const workspaceIdParamSchema = z.object({
  id: z.string().min(1).max(50),
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
        const conditions = ['form_id = ?'];
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

      // Set cache headers for analytics data
      setCacheHeaders(c, CACHE_CONFIGS.ANALYTICS);

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
 * GET /:id/analytics - Get form analytics with real data
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
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const db = getDb(c.env);

      // Generate cache key based on formId and query parameters
      const cacheKey = `analytics:${formId}:${query.dateFrom || 'default'}:${query.dateTo || 'default'}:${query.includeFieldAnalytics}`;

      // Try to get cached analytics data first (1 hour TTL)
      try {
        const cachedAnalytics = await c.env.ANALYTICS_CACHE.get(cacheKey, 'json') as AnalyticsResponse | null;
        if (cachedAnalytics) {
          // Set cache headers for cached analytics
          setCacheHeaders(c, CACHE_CONFIGS.ANALYTICS);
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

      // Create date range object for utility functions
      const dateRange = {
        from: dateFromSeconds,
        to: dateToSeconds
      };

      // Use the new analytics utility to calculate all metrics with real data
      const analyticsData: AnalyticsMetrics = await calculateFormAnalytics(
        db,
        formId,
        workspaceId,
        dateRange,
        query.includeFieldAnalytics
      );

      // Get additional views data for the frontend format
      const viewsData = await getSubmissionRate(db, formId, dateRange);
      const views = viewsData.map(item => ({
        date: item.date,
        count: item.count
      }));

      // Calculate total views for frontend compatibility
      let totalViewsQuery = 'SELECT COUNT(id) AS totalViews FROM form_views WHERE form_id = ?';
      const viewParams = [formId];
      
      if (dateRange.from) {
        totalViewsQuery += ' AND viewed_at >= ?';
        viewParams.push(String(dateRange.from));
      }
      
      if (dateRange.to) {
        totalViewsQuery += ' AND viewed_at <= ?';
        viewParams.push(String(dateRange.to));
      }

      const totalViewsResult = await db.prepare(totalViewsQuery)
        .bind(...viewParams.map(p => String(p)))
        .all();
      
      const totalViews = (totalViewsResult.results[0] as { totalViews: number })?.totalViews || 0;

      // Final response with real data
      const response: AnalyticsResponse = {
        totalSubmissions: analyticsData.totalSubmissions,
        totalViews, // Include total views for frontend compatibility
        completionRate: analyticsData.completionRate,
        averageTime: analyticsData.averageTime,
        views,
        submissionRate: analyticsData.submissionRate,
        fieldAnalytics: analyticsData.fieldAnalytics,
        peakSubmissionTimes: analyticsData.peakSubmissionTimes,
      };

      // Cache the analytics data for 1 hour (3600 seconds)
      try {
        // Determine data type based on date range
        const dataType = this.getAnalyticsDataType(query.dateFrom, query.dateTo);
        
        // Calculate dynamic TTL
        const ttl = TTLManager.getAnalyticsTTL(dataType, {
          from: query.dateFrom,
          to: query.dateTo
        });

        await c.env.ANALYTICS_CACHE.put(cacheKey, JSON.stringify(response), {
          expirationTtl: ttl
        });
      } catch (cacheError) {
        // Log cache error but don't fail the request
        console.warn('[Analytics Cache Put Error]', cacheError);
      }

      // Set cache headers for fresh analytics data
      setCacheHeaders(c, CACHE_CONFIGS.ANALYTICS);

      return c.json<AnalyticsResponse>({
        success: true,
        data: response,
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

/**
 * GET /:id/analytics/dropoff - Get form drop-off analysis
 * (Resolves to /api/forms/:formId/analytics/dropoff)
 */
analyticsRouter.get(
  '/analytics/dropoff',
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

      // Get form schema for analysis
      const formQuery = db.prepare(
        'SELECT schema FROM forms WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL'
      ).bind(formId, workspaceId);

      const formResult = await formQuery.all();
      const form = formResult.results[0] as { schema: string } | undefined;
      const formSchema = form?.schema ? JSON.parse(form.schema) : [];

      // Convert milliseconds to seconds for SQLite timestamp comparison
      const dateFromSeconds = query.dateFrom ? Math.floor(query.dateFrom / 1000) : undefined;
      const dateToSeconds = query.dateTo ? Math.floor(query.dateTo / 1000) : undefined;

      const dateRange = {
        from: dateFromSeconds,
        to: dateToSeconds
      };

      // Calculate drop-off analysis
      const dropoffAnalysis: FormDropoffAnalysis = await calculateDropoffAnalysis(
        db,
        formId,
        formSchema,
        dateRange
      );

      // Set cache headers for analytics data
      setCacheHeaders(c, CACHE_CONFIGS.ANALYTICS);

      return c.json({
        success: true,
        data: dropoffAnalysis,
        message: `Drop-off analysis for form ${formId}`,
      });

    } catch (error) {
      console.error('[Get Drop-off Analysis Error]', error);
      return c.json({
        success: false,
        error: 'Failed to get drop-off analysis',
      }, 500);
    }
  }
);

/**
 * GET /:id/analytics/workspace - Get workspace-level analytics
 * (Resolves to /api/workspaces/:workspaceId/analytics)
 */
analyticsRouter.get(
  '/analytics/workspace',
  authMiddleware,
  zValidator('param', workspaceIdParamSchema),
  zValidator('query', analyticsQuerySchema),
  async (c) => {
    const { id: workspaceId } = c.req.valid('param');
    const query = c.req.valid('query');

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const db = getDb(c.env);

      // Convert milliseconds to seconds for SQLite timestamp comparison
      const dateFromSeconds = query.dateFrom ? Math.floor(query.dateFrom / 1000) : undefined;
      const dateToSeconds = query.dateTo ? Math.floor(query.dateTo / 1000) : undefined;

      const dateRange = {
        from: dateFromSeconds,
        to: dateToSeconds
      };

      // Get workspace analytics
      const workspaceAnalytics: WorkspaceAnalytics = await getWorkspaceAnalytics(
        c,
        db,
        workspaceId,
        dateRange
      );

      // Set cache headers for analytics data
      setCacheHeaders(c, CACHE_CONFIGS.ANALYTICS);

      return c.json<WorkspaceAnalyticsResponse>({
        success: true,
        data: workspaceAnalytics,
        message: `Workspace analytics for workspace ${workspaceId}`,
      } as any);

    } catch (error) {
      console.error('[Get Workspace Analytics Error]', error);
      return c.json({
        success: false,
        error: 'Failed to get workspace analytics',
      }, 500);
    }
  }
);

export default analyticsRouter;