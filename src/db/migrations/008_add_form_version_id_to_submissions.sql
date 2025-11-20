-- Migration: Add form_version_id to submissions table
-- Description: Add form_version_id column to submissions table for form versioning support
-- Timestamp: 2025-11-20
-- Issue: The recent submission API changes expect form_version_id but it wasn't added to the base schema

ALTER TABLE submissions ADD COLUMN form_version_id TEXT;

-- Add foreign key constraint
ALTER TABLE submissions ADD CONSTRAINT fk_submissions_form_version 
FOREIGN KEY (form_version_id) REFERENCES form_versions(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_submissions_form_version ON submissions(form_version_id);