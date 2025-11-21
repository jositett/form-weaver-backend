-- Migration: 010_add_version_notes_to_form_versions.sql
-- Add version_notes column to form_versions table for auto-create functionality

ALTER TABLE form_versions ADD COLUMN version_notes TEXT;