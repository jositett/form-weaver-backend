-- Add webhooks table for form webhook configurations
CREATE TABLE IF NOT EXISTS webhooks (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  url TEXT NOT NULL,
  secret TEXT NOT NULL, -- Webhook secret for signature verification
  events TEXT NOT NULL, -- JSON array of events to trigger on (e.g., ["submission.created"])
  enabled INTEGER DEFAULT 1, -- 0 = disabled, 1 = enabled
  retry_count INTEGER DEFAULT 3, -- Number of retry attempts
  timeout_seconds INTEGER DEFAULT 30, -- Request timeout
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Add webhook delivery history table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  webhook_id TEXT NOT NULL,
  form_id TEXT NOT NULL,
  submission_id TEXT, -- Optional, for submission-related events
  event_type TEXT NOT NULL, -- e.g., "submission.created"
  payload TEXT NOT NULL, -- JSON payload sent
  status TEXT CHECK(status IN ('pending', 'success', 'failed', 'retrying')) DEFAULT 'pending',
  response_status INTEGER, -- HTTP status code from webhook endpoint
  response_body TEXT, -- Response body from webhook endpoint
  error_message TEXT, -- Error message if delivery failed
  attempt_count INTEGER DEFAULT 0, -- Current attempt number
  next_retry_at INTEGER, -- Timestamp for next retry attempt
  delivered_at INTEGER, -- Timestamp when successfully delivered
  created_at INTEGER NOT NULL,
  FOREIGN KEY (webhook_id) REFERENCES webhooks(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE,
  FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE SET NULL
);

-- Indexes for webhooks
CREATE INDEX IF NOT EXISTS idx_webhooks_form ON webhooks(form_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_workspace ON webhooks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled, form_id);

-- Indexes for webhook deliveries
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_form ON webhook_deliveries(form_id, created_at DESC);