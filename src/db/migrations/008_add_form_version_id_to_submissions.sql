-- Migration: Add form_version_id to submissions table
-- Description: Add form_version_id column to submissions table for form versioning support
-- Timestamp: 2025-11-20
-- Issue: The recent submission API changes expect form_version_id but it wasn't added to the base schema
-- Note: SQLite doesn't support adding foreign key constraints with ALTER TABLE

ALTER TABLE submissions ADD COLUMN form_version_id TEXT;

-- Create index for performance
CREATE INDEX idx_submissions_form_version ON submissions(form_version_id);