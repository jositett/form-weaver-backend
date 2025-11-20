-- Migration: Add form views tracking
-- Description: Add table to track form views for analytics
-- Timestamp: 2025-01-20

-- Form views table (for analytics)
CREATE TABLE IF NOT EXISTS form_views (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  referrer TEXT,
  viewed_at INTEGER NOT NULL,
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_form_views_form ON form_views(form_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_form_views_date ON form_views(viewed_at);