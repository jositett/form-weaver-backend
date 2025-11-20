-- Migration: 003_add_form_versions_indexes.sql
-- Add an index to form_versions for optimized version history queries.

CREATE INDEX idx_form_versions_form_id_version_number ON form_versions (form_id, version_number DESC);