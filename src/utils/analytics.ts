import { getDb } from '../db/db';
import type { Context } from 'hono';

/**
 * Analytics calculation utilities for real data aggregation
 * Provides optimized database queries for form analytics metrics
 */

export interface AnalyticsMetrics {
  totalSubmissions: number;
  totalViews: number;
  completionRate: number; // 0.0 to 1.0
  averageTime: number; // seconds
  submissionRate: Array<{ date: string; count: number }>;
  peakSubmissionTimes?: {
    hourlyDistribution: Array<{
      hour: number;
      count: number;
      percentage: number;
    }>;
    peakHour: number;
    peakHourCount: number;
  };
  fieldAnalytics?: {
    mostSkippedFields: Array<{
      fieldId: string;
      fieldLabel?: string;
      skipCount: number;
      skipRate: number;
    }>;
    mostErrorFields: Array<{
      fieldId: string;
      fieldLabel?: string;
      errorCount: number;
      errorRate: number;
    }>;
  };
}

export interface WorkspaceAnalytics {
  totalSubmissions: number;
  totalViews: number;
  averageCompletionRate: number;
  totalForms: number;
  activeForms: number;
  submissionTrends: Array<{ date: string; submissions: number; views: number }>;
}

export interface FormDropoffAnalysis {
  startedSubmissions: number;
  completedSubmissions: number;
  abandonedSubmissions: number;
  dropoffRate: number;
  fieldDropoff: Array<{
    fieldId: string;
    fieldName: string;
    dropoffCount: number;
    dropoffRate: number;
  }>;
}

interface DateRange {
  from?: number;
  to?: number;
}

/**
 * Get date range filters for queries
 */
function getDateRangeFilters(dateRange?: DateRange) {
  const conditions: string[] = [];
  const params: string[] = [];

  if (dateRange?.from) {
    conditions.push('submitted_at >= ?');
    params.push(String(dateRange.from));
  }

  if (dateRange?.to) {
    conditions.push('submitted_at <= ?');
    params.push(String(dateRange.to));
  }

  return { conditions, params };
}

/**
 * Calculate real completion rate based on form views vs submissions
 */
export async function calculateCompletionRate(
  db: any,
  formId: string,
  dateRange?: DateRange
): Promise<number> {
  try {
    const { conditions, params } = getDateRangeFilters(dateRange);
    
    // Count total views
    let viewsQuery = 'SELECT COUNT(id) AS totalViews FROM form_views WHERE form_id = ?';
    const viewsParams = [formId];
    
    if (dateRange?.from) {
      viewsQuery += ' AND viewed_at >= ?';
      viewsParams.push(String(dateRange.from));
    }
    
    if (dateRange?.to) {
      viewsQuery += ' AND viewed_at <= ?';
      viewsParams.push(String(dateRange.to));
    }

    // Count submissions
    let submissionsQuery = 'SELECT COUNT(id) AS totalSubmissions FROM submissions WHERE form_id = ?';
    const submissionParams = [formId];
    submissionParams.push(...params);

    if (conditions.length > 0) {
      submissionsQuery += ' AND ' + conditions.join(' AND ');
    }

    const [viewsResult, submissionsResult] = await db.batch([
      db.prepare(viewsQuery).bind(...viewsParams.map(p => String(p))),
      db.prepare(submissionsQuery).bind(...submissionParams.map(p => String(p)))
    ]);

    const totalViews = (viewsResult[0]?.results[0] as { totalViews: number })?.totalViews || 0;
    const totalSubmissions = (submissionsResult[0]?.results[0] as { totalSubmissions: number })?.totalSubmissions || 0;

    // Return 0 if no views or error occurred
    if (totalViews <= 0) return 0;
    
    const completionRate = totalSubmissions / totalViews;
    
    // Ensure completion rate is between 0 and 1
    return Math.max(0, Math.min(1, completionRate));
  } catch (error) {
    console.error('[Completion Rate Calculation Error]', error);
    return 0; // Return 0 on error instead of throwing
  }
}

/**
 * Calculate real average completion time using started_at timestamps
 */
export async function calculateAverageTime(
  db: any,
  formId: string,
  dateRange?: DateRange
): Promise<number> {
  try {
    const { conditions, params } = getDateRangeFilters(dateRange);
    
    let query = `
      SELECT
        AVG(submitted_at - started_at) AS avgTime,
        COUNT(CASE WHEN started_at IS NOT NULL THEN 1 END) AS validSubmissions
      FROM submissions
      WHERE form_id = ? AND started_at IS NOT NULL
    `;
    
    const queryParams = [formId, ...params];
    
    if (conditions.length > 0) {
      query += ' AND ' + conditions.join(' AND ');
    }

    const result = await db.prepare(query).bind(...queryParams.map(p => String(p))).all();
    const data = result.results[0] as { avgTime: number | null; validSubmissions: number };
    
    // Return average time in seconds, fallback to 120 if no data or error
    if (!data || data.validSubmissions === 0 || data.avgTime === null) {
      return 120; // Default fallback
    }
    
    const avgTime = data.avgTime;
    
    // Ensure average time is positive and reasonable (between 1 second and 24 hours)
    if (avgTime < 1) return 1;
    if (avgTime > 86400) return 86400; // Cap at 24 hours
    
    return avgTime;
  } catch (error) {
    console.error('[Average Time Calculation Error]', error);
    return 120; // Return default on error
  }
}

/**
 * Get submission rate trends with date grouping
 */
export async function getSubmissionRate(
  db: any,
  formId: string,
  dateRange?: DateRange
): Promise<Array<{ date: string; count: number }>> {
  const { conditions, params } = getDateRangeFilters(dateRange);
  
  let query = `
    SELECT 
      strftime('%Y-%m-%d', submitted_at, 'unixepoch') AS date,
      COUNT(id) AS count
    FROM submissions 
    WHERE form_id = ?
  `;
  
  const queryParams = [formId, ...params];
  
  if (conditions.length > 0) {
    query += ' AND ' + conditions.join(' AND ');
  }
  
  query += ' GROUP BY date ORDER BY date ASC';

  const result = await db.prepare(query).bind(...queryParams.map(p => String(p))).all();
  return result.results as Array<{ date: string; count: number }>;
}

/**
 * Get peak submission times analysis (hourly distribution)
 */
export async function getPeakSubmissionTimes(
  db: any,
  formId: string,
  dateRange?: DateRange
): Promise<{
  hourlyDistribution: Array<{ hour: number; count: number; percentage: number }>;
  peakHour: number;
  peakHourCount: number;
} | null> {
  const { conditions, params } = getDateRangeFilters(dateRange);
  
  let query = `
    SELECT 
      strftime('%H', submitted_at, 'unixepoch') AS hour,
      COUNT(id) AS count
    FROM submissions 
    WHERE form_id = ?
  `;
  
  const queryParams = [formId, ...params];
  
  if (conditions.length > 0) {
    query += ' AND ' + conditions.join(' AND ');
  }
  
  query += ' GROUP BY hour ORDER BY hour ASC';

  const result = await db.prepare(query).bind(...queryParams.map(p => String(p))).all();
  const hourlyData = result.results as Array<{ hour: string; count: number }>;
  
  if (hourlyData.length === 0) {
    return null;
  }

  const totalSubmissions = hourlyData.reduce((sum, item) => sum + item.count, 0);
  
  // Create complete 24-hour distribution
  const hourlyDistribution = Array.from({ length: 24 }, (_, hour) => {
    const hourData = hourlyData.find(item => parseInt(item.hour) === hour);
    const count = hourData ? hourData.count : 0;
    return {
      hour,
      count,
      percentage: totalSubmissions > 0 ? count / totalSubmissions : 0
    };
  });

  // Find peak hour
  const peakHourData = hourlyDistribution.reduce((max, current) =>
    current.count > max.count ? current : max
  );

  return {
    hourlyDistribution,
    peakHour: peakHourData.hour,
    peakHourCount: peakHourData.count
  };
}

/**
 * Calculate field-level analytics with real skip rates
 */
export async function calculateFieldAnalytics(
  db: any,
  formId: string,
  formSchema: any[],
  dateRange?: DateRange
): Promise<{
  mostSkippedFields: Array<{
    fieldId: string;
    fieldLabel?: string;
    skipCount: number;
    skipRate: number;
  }>;
  mostErrorFields: Array<{
    fieldId: string;
    fieldLabel?: string;
    errorCount: number;
    errorRate: number;
  }>;
}> {
  const { conditions, params } = getDateRangeFilters(dateRange);
  
  // Get submission count for rate calculations
  let submissionCountQuery = 'SELECT COUNT(id) AS totalCount FROM submissions WHERE form_id = ?';
  const countParams = [formId, ...params];
  
  if (conditions.length > 0) {
    submissionCountQuery += ' AND ' + conditions.join(' AND ');
  }
  
  // Get submissions data
  let submissionsQuery = 'SELECT data FROM submissions WHERE form_id = ?';
  const submissionParams = [formId, ...params];
  
  if (conditions.length > 0) {
    submissionsQuery += ' AND ' + conditions.join(' AND ');
  }

  const [countResult, submissionsResult] = await db.batch([
    db.prepare(submissionCountQuery).bind(...countParams.map(p => String(p))),
    db.prepare(submissionsQuery).bind(...submissionParams.map(p => String(p)))
  ]);

  const totalCount = (countResult[0]?.results[0] as { totalCount: number })?.totalCount || 0;
  const submissionData = submissionsResult[0]?.results as { data: string }[] || [];

  if (totalCount === 0 || submissionData.length === 0) {
    return { mostSkippedFields: [], mostErrorFields: [] };
  }

  // Initialize field tracking
  const fieldStats: Record<string, {
    skips: number;
    errors: number;
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
      console.error('[Submission Parse Error in Field Analytics]', error);
    }
  });

  // Convert to arrays and calculate rates
  const mostSkippedFields = Object.entries(fieldStats)
    .map(([fieldId, stats]) => ({
      fieldId,
      fieldLabel: stats.field.label,
      skipCount: stats.skips,
      skipRate: totalCount > 0 ? stats.skips / totalCount : 0,
    }))
    .sort((a, b) => b.skipRate - a.skipRate)
    .slice(0, 10);

  // For now, mostErrorFields is empty since we don't track validation errors
  // This could be enhanced to track actual validation failures in the future
  const mostErrorFields = Object.entries(fieldStats)
    .map(([fieldId, stats]) => ({
      fieldId,
      fieldLabel: stats.field.label,
      errorCount: stats.errors,
      errorRate: totalCount > 0 ? stats.errors / totalCount : 0,
    }))
    .filter(field => field.errorCount > 0)
    .sort((a, b) => b.errorRate - a.errorRate)
    .slice(0, 10);

  return {
    mostSkippedFields,
    mostErrorFields,
  };
}

/**
 * Calculate drop-off analysis for form abandonment patterns
 */
export async function calculateDropoffAnalysis(
  db: any,
  formId: string,
  formSchema: any[],
  dateRange?: DateRange
): Promise<FormDropoffAnalysis> {
  const { conditions, params } = getDateRangeFilters(dateRange);
  
  // Get view count (started submissions)
  let viewsQuery = 'SELECT COUNT(id) AS viewCount FROM form_views WHERE form_id = ?';
  const viewParams = [formId];
  
  if (dateRange?.from) {
    viewsQuery += ' AND viewed_at >= ?';
    viewParams.push(String(dateRange.from));
  }
  
  if (dateRange?.to) {
    viewsQuery += ' AND viewed_at <= ?';
    viewParams.push(String(dateRange.to));
  }

  // Get submission count (completed submissions)
  let submissionsQuery = 'SELECT COUNT(id) AS submissionCount FROM submissions WHERE form_id = ?';
  const submissionParams = [formId, ...params];
  
  if (conditions.length > 0) {
    submissionsQuery += ' AND ' + conditions.join(' AND ');
  }

  const [viewsResult, submissionsResult] = await db.batch([
    db.prepare(viewsQuery).bind(...viewParams.map(p => String(p))),
    db.prepare(submissionsQuery).bind(...submissionParams.map(p => String(p)))
  ]);

  const startedSubmissions = (viewsResult[0]?.results[0] as { viewCount: number })?.viewCount || 0;
  const completedSubmissions = (submissionsResult[0]?.results[0] as { submissionCount: number })?.submissionCount || 0;
  const abandonedSubmissions = Math.max(0, startedSubmissions - completedSubmissions);
  const dropoffRate = startedSubmissions > 0 ? abandonedSubmissions / startedSubmissions : 0;

  // Calculate field-level drop-off (placeholder - would need more detailed tracking)
  const fieldDropoff = formSchema
    .filter(field => field.id)
    .map(field => ({
      fieldId: field.id,
      fieldName: field.label || field.id,
      dropoffCount: 0, // Would need form field completion tracking
      dropoffRate: 0,
    }))
    .slice(0, 10);

  return {
    startedSubmissions,
    completedSubmissions,
    abandonedSubmissions,
    dropoffRate,
    fieldDropoff,
  };
}

/**
 * Get workspace-level analytics aggregation
 */
export async function getWorkspaceAnalytics(
  c: Context,
  db: any,
  workspaceId: string,
  dateRange?: DateRange
): Promise<WorkspaceAnalytics> {
  // Create cache key based on workspace and date range
  const cacheKey = `workspace-analytics:${workspaceId}:${dateRange?.from || 'all'}:${dateRange?.to || 'all'}`;
  
  // Try to get cached result
  const cached = await c.env.ANALYTICS_CACHE.get(cacheKey, { type: 'json' });
  if (cached) {
    return cached;
  }

  const { conditions, params } = getDateRangeFilters(dateRange);
  
  // Count forms in workspace
  const formsQuery = db.prepare(
    'SELECT COUNT(id) AS totalForms, COUNT(CASE WHEN status = "published" THEN 1 END) AS activeForms FROM forms WHERE workspace_id = ? AND deleted_at IS NULL'
  ).bind(workspaceId);

  // Get form IDs for workspace
  const formIdsQuery = db.prepare(
    'SELECT id FROM forms WHERE workspace_id = ? AND deleted_at IS NULL'
  ).bind(workspaceId);

  const [formsResult, formIdsResult] = await db.batch([formsQuery, formIdsQuery]);
  
  const workspaceForms = formIdsResult[1]?.results as { id: string }[] || [];
  const formIds = workspaceForms.map(f => f.id);
  
  if (formIds.length === 0) {
    return {
      totalSubmissions: 0,
      totalViews: 0,
      averageCompletionRate: 0,
      totalForms: 0,
      activeForms: 0,
      submissionTrends: []
    };
  }

  // Build IN clause for form IDs
  const formIdsPlaceholder = formIds.map(() => '?').join(',');
  
  // Count total submissions
  let submissionsQuery = `SELECT COUNT(id) AS totalSubmissions FROM submissions WHERE form_id IN (${formIdsPlaceholder})`;
  const submissionParams = [...formIds, ...params];
  
  if (conditions.length > 0) {
    submissionsQuery += ' AND ' + conditions.join(' AND ');
  }

  // Count total views
  let viewsQuery = `SELECT COUNT(id) AS totalViews FROM form_views WHERE form_id IN (${formIdsPlaceholder})`;
  const viewParams = [...formIds];
  
  if (dateRange?.from) {
    viewsQuery += ' AND viewed_at >= ?';
    viewParams.push(String(dateRange.from));
  }
  
  if (dateRange?.to) {
    viewsQuery += ' AND viewed_at <= ?';
    viewParams.push(String(dateRange.to));
  }

  // Get submission trends
  let trendsQuery = `
    SELECT
      strftime('%Y-%m-%d', submitted_at, 'unixepoch') AS date,
      COUNT(id) AS submissions
    FROM submissions
    WHERE form_id IN (${formIdsPlaceholder})
  `;
  const trendParams = [...formIds, ...params];
  
  if (conditions.length > 0) {
    trendsQuery += ' AND ' + conditions.join(' AND ');
  }
  
  trendsQuery += ' GROUP BY date ORDER BY date ASC';

  const [submissionsResult, viewsResult, trendsResult] = await db.batch([
    db.prepare(submissionsQuery).bind(...submissionParams.map(p => String(p))),
    db.prepare(viewsQuery).bind(...viewParams.map(p => String(p))),
    db.prepare(trendsQuery).bind(...trendParams.map(p => String(p)))
  ]);

  const totalSubmissions = (submissionsResult[0]?.results[0] as { totalSubmissions: number })?.totalSubmissions || 0;
  const totalViews = (viewsResult[0]?.results[0] as { totalViews: number })?.totalViews || 0;
  const submissionTrends = trendsResult[0]?.results as Array<{ date: string; submissions: number }> || [];

  // Calculate average completion rate across all forms
  let totalCompletionRate = 0;
  let validForms = 0;
  
  for (const formId of formIds) {
    try {
      const completionRate = await calculateCompletionRate(db, formId, dateRange);
      if (completionRate > 0) {
        totalCompletionRate += completionRate;
        validForms++;
      }
    } catch (error) {
      console.error(`[Completion Rate Calc Error for form ${formId}]`, error);
    }
  }
  
  const averageCompletionRate = validForms > 0 ? totalCompletionRate / validForms : 0;

  // Add views to trends data
  const enrichedTrends = submissionTrends.map(trend => ({
    date: trend.date,
    submissions: trend.submissions,
    views: 0 // Would need to calculate views per date
  }));

  const result = {
    totalSubmissions,
    totalViews,
    averageCompletionRate,
    totalForms: (formsResult[0]?.results[0] as { totalForms: number })?.totalForms || 0,
    activeForms: (formsResult[0]?.results[0] as { activeForms: number })?.activeForms || 0,
    submissionTrends: enrichedTrends
  };

  // Cache result for 1 hour
  await c.env.ANALYTICS_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 3600 });

  return result;
}

/**
 * Main analytics calculation function that orchestrates all metrics
 */
export async function calculateFormAnalytics(
  db: any,
  formId: string,
  workspaceId: string,
  dateRange?: DateRange,
  includeFieldAnalytics: boolean = true
): Promise<AnalyticsMetrics> {
  try {
    // Get form schema
    const formQuery = db.prepare(
      'SELECT schema FROM forms WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL'
    ).bind(formId, workspaceId);

    const formResult = await formQuery.all();
    const form = formResult.results[0] as { schema: string } | undefined;
    const formSchema = form?.schema ? JSON.parse(form.schema) : [];

    // Get total submissions count
    const { conditions, params } = getDateRangeFilters(dateRange);
    let totalSubmissionsQuery = 'SELECT COUNT(id) AS totalSubmissions FROM submissions WHERE form_id = ?';
    
    if (conditions.length > 0) {
      totalSubmissionsQuery += ' AND ' + conditions.join(' AND ');
    }
    
    const totalSubmissionsResult = await db.prepare(totalSubmissionsQuery)
      .bind(...[formId, ...params].map(p => String(p)))
      .all();
    
    const totalSubmissions = (totalSubmissionsResult.results[0] as { totalSubmissions: number })?.totalSubmissions || 0;

    // Calculate all metrics in parallel
    const [
      completionRate,
      averageTime,
      submissionRate,
      peakSubmissionTimes,
      fieldAnalytics
    ] = await Promise.all([
      calculateCompletionRate(db, formId, dateRange),
      calculateAverageTime(db, formId, dateRange),
      getSubmissionRate(db, formId, dateRange),
      getPeakSubmissionTimes(db, formId, dateRange),
      includeFieldAnalytics && formSchema.length > 0 
        ? calculateFieldAnalytics(db, formId, formSchema, dateRange)
        : Promise.resolve({ mostSkippedFields: [], mostErrorFields: [] })
    ]);

    return {
      totalSubmissions,
      completionRate,
      averageTime,
      submissionRate,
      peakSubmissionTimes,
      fieldAnalytics: includeFieldAnalytics ? fieldAnalytics : undefined,
      // Note: totalViews is calculated within completionRate calculation
      // To get standalone totalViews, we'd need to call a separate view count function
    };

  } catch (error) {
    console.error('[Analytics Calculation Error]', error);
    throw new Error('Failed to calculate analytics metrics');
  }
}