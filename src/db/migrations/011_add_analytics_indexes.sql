-- Migration: Add analytics-specific database indexes
-- Description: Optimize analytics queries with proper indexing
-- Timestamp: 2025-11-22

-- Index for form_views table to optimize date range queries
CREATE INDEX IF NOT EXISTS idx_form_views_form_date ON form_views(form_id, viewed_at);

-- Index for submissions table to optimize analytics queries
CREATE INDEX IF NOT EXISTS idx_submissions_form_date ON submissions(form_id, submitted_at);
CREATE INDEX IF NOT EXISTS idx_submissions_form_started ON submissions(form_id, started_at);

-- Composite index for analytics queries that filter by form and date range
CREATE INDEX IF NOT EXISTS idx_submissions_form_date_status ON submissions(form_id, submitted_at, started_at);

-- Index for workspace analytics queries
CREATE INDEX IF NOT EXISTS idx_forms_workspace_status ON forms(workspace_id, status, deleted_at);

-- Index for form_views with workspace context (for future workspace analytics)
CREATE INDEX IF NOT EXISTS idx_form_views_workspace_form ON form_views(form_id);