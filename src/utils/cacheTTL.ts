/**
 * Dynamic TTL calculation utilities for Workers KV caching strategies
 */

export interface TTLConfig {
  default: number;
  max: number;
  min: number;
}

export class TTLManager {
  // Configuration for form cache TTLs
  private static readonly FORM_TTL_CONFIG: TTLConfig = {
    default: 600,  // 10 minutes
    max: 1800,     // 30 minutes
    min: 300       // 5 minutes
  };

  // Configuration for analytics cache TTLs
  private static readonly ANALYTICS_TTL_CONFIG: TTLConfig = {
    default: 3600, // 1 hour
    max: 7200,     // 2 hours
    min: 300       // 5 minutes
  };

  /**
   * Calculate dynamic TTL for forms based on status and usage patterns
   * @param form - Form data including status and usage metrics
   * @returns TTL in seconds
   */
  static getFormTTL(form: {
    status: 'published' | 'draft' | 'archived';
    viewCount?: number;
    lastUpdated?: number;
    isPopular?: boolean;
  }): number {
    let baseTTL = this.FORM_TTL_CONFIG.default;

    // Status-based adjustments
    switch (form.status) {
      case 'published':
        baseTTL = form.isPopular ? 1800 : 900; // 30min for popular, 15min for regular
        break;
      case 'draft':
        baseTTL = 300; // 5 minutes for drafts (frequent changes)
        break;
      case 'archived':
        baseTTL = 3600; // 1 hour for archived (rarely accessed)
        break;
    }

    // View count adjustments
    if (form.viewCount && form.viewCount > 1000) {
      baseTTL += 300; // +5 minutes for high-traffic forms
    } else if (form.viewCount && form.viewCount < 100) {
      baseTTL -= 180; // -3 minutes for low-traffic forms
    }

    // Recency adjustments
    if (form.lastUpdated) {
      const hoursSinceUpdate = (Date.now() - form.lastUpdated) / (1000 * 60 * 60);
      if (hoursSinceUpdate < 1) {
        baseTTL = Math.min(baseTTL, 600); // Cap at 10 minutes for recent updates
      } else if (hoursSinceUpdate > 24) {
        baseTTL = Math.max(baseTTL, 1200); // Minimum 20 minutes for stale data
      }
    }

    // Ensure TTL stays within configured bounds
    return Math.max(
      this.FORM_TTL_CONFIG.min,
      Math.min(this.FORM_TTL_CONFIG.max, baseTTL)
    );
  }

  /**
   * Calculate dynamic TTL for analytics based on data type and recency
   * @param dataType - Type of analytics data
   * @param dateRange - Time range of the analytics data
   * @returns TTL in seconds
   */
  static getAnalyticsTTL(
    dataType: 'realtime' | 'daily' | 'weekly' | 'historical', 
    dateRange: { from?: number; to?: number }
  ): number {
    let baseTTL = this.ANALYTICS_TTL_CONFIG.default;

    // Data type adjustments
    switch (dataType) {
      case 'realtime':
        baseTTL = 300; // 5 minutes for real-time data
        break;
      case 'daily':
        baseTTL = 1800; // 30 minutes for daily aggregates
        break;
      case 'weekly':
        baseTTL = 3600; // 1 hour for weekly data
        break;
      case 'historical':
        baseTTL = 7200; // 2 hours for historical data
        break;
    }

    // Date range adjustments
    if (dateRange.to) {
      const daysAgo = (Date.now() - dateRange.to) / (1000 * 60 * 60 * 24);
      
      if (daysAgo < 1) {
        // Very recent data - shorter TTL
        baseTTL = Math.min(baseTTL, 900);
      } else if (daysAgo > 30) {
        // Old data - longer TTL
        baseTTL = Math.max(baseTTL, 3600);
      }
    }

    // Ensure TTL stays within configured bounds
    return Math.max(
      this.ANALYTICS_TTL_CONFIG.min,
      Math.min(this.ANALYTICS_TTL_CONFIG.max, baseTTL)
    );
  }

  /**
   * Calculate sliding TTL for sessions based on activity
   * @param lastActivity - Timestamp of last activity
   * @param sessionType - Type of session token
   * @returns TTL in seconds
   */
  static getSessionTTL(lastActivity: number, sessionType: 'refresh' | 'access'): number {
    const daysSinceActivity = (Date.now() - lastActivity) / (1000 * 60 * 60 * 24);
    
    if (sessionType === 'refresh') {
      if (daysSinceActivity < 7) {
        return 2592000; // 30 days for recently active users
      } else if (daysSinceActivity < 14) {
        return 1296000; // 15 days for moderately active users
      } else {
        return 604800; // 7 days for inactive users
      }
    } else {
      // Access tokens have shorter lifespans
      return 3600; // 1 hour
    }
  }
}