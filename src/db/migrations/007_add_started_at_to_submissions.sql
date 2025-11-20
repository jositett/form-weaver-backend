-- Migration: Add started_at timestamp to submissions table
-- Description: Track when form submissions started for analytics (completion time calculation)
-- Timestamp: 2025-11-20

ALTER TABLE submissions ADD COLUMN started_at INTEGER;