-- Migration: Add email notifications table
-- Created: 2025-01-16
-- Description: Add support for email notification preferences and history

-- Form notification preferences
CREATE TABLE IF NOT EXISTS form_notifications (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  
  -- Notification settings
  enabled BOOLEAN NOT NULL DEFAULT true,
  notify_on_submission BOOLEAN NOT NULL DEFAULT true,
  notify_on_daily_summary BOOLEAN NOT NULL DEFAULT false,
  notify_on_weekly_report BOOLEAN NOT NULL DEFAULT false,
  
  -- Email configuration
  recipient_emails TEXT NOT NULL, -- JSON array of email addresses
  email_template_id TEXT, -- Reference to custom template (future)
  
  -- Metadata
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  
  -- Foreign key constraints
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Email notification history (for tracking sent notifications)
CREATE TABLE IF NOT EXISTS notification_history (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  
  -- Notification details
  notification_type TEXT NOT NULL, -- 'submission', 'daily_summary', 'weekly_report'
  recipient_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  
  -- Delivery status
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed', 'bounced'
  sent_at INTEGER,
  error_message TEXT,
  
  -- Related data
  submission_id TEXT, -- For submission notifications
  email_service_id TEXT, -- External service message ID
  
  -- Metadata
  created_at INTEGER NOT NULL,
  
  -- Foreign key constraints
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE SET NULL
);

-- Email templates (for customizable notification templates)
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  
  -- Template details
  name TEXT NOT NULL,
  template_type TEXT NOT NULL, -- 'submission', 'daily_summary', 'weekly_report'
  subject_template TEXT NOT NULL,
  body_template TEXT NOT NULL, -- HTML template with placeholders
  
  -- Template settings
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  
  -- Metadata
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  
  -- Foreign key constraints
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);