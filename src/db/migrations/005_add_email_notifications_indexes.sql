-- Migration: Add indexes for email notifications tables
-- Created: 2025-01-16
-- Description: Add performance indexes for email notification queries

-- Indexes for form_notifications table
CREATE INDEX IF NOT EXISTS idx_form_notifications_form_id ON form_notifications(form_id);
CREATE INDEX IF NOT EXISTS idx_form_notifications_workspace_id ON form_notifications(workspace_id);
CREATE INDEX IF NOT EXISTS idx_form_notifications_enabled ON form_notifications(enabled);
CREATE INDEX IF NOT EXISTS idx_form_notifications_created_at ON form_notifications(created_at);

-- Indexes for notification_history table
CREATE INDEX IF NOT EXISTS idx_notification_history_form_id ON notification_history(form_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_workspace_id ON notification_history(workspace_id);
CREATE INDEX IF NOT EXISTS idx_notification_history_type ON notification_history(notification_type);
CREATE INDEX IF NOT EXISTS idx_notification_history_status ON notification_history(status);
CREATE INDEX IF NOT EXISTS idx_notification_history_recipient ON notification_history(recipient_email);
CREATE INDEX IF NOT EXISTS idx_notification_history_created_at ON notification_history(created_at);
CREATE INDEX IF NOT EXISTS idx_notification_history_sent_at ON notification_history(sent_at);

-- Indexes for email_templates table
CREATE INDEX IF NOT EXISTS idx_email_templates_workspace_id ON email_templates(workspace_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates(template_type);
CREATE INDEX IF NOT EXISTS idx_email_templates_default ON email_templates(is_default);
CREATE INDEX IF NOT EXISTS idx_email_templates_active ON email_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_email_templates_created_at ON email_templates(created_at);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_form_notifications_form_enabled ON form_notifications(form_id, enabled);
CREATE INDEX IF NOT EXISTS idx_notification_history_form_type ON notification_history(form_id, notification_type);
CREATE INDEX IF NOT EXISTS idx_email_templates_workspace_type ON email_templates(workspace_id, template_type, is_active);