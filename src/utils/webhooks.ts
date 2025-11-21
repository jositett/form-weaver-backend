import { Env, WebhookEvent, WebhookDelivery } from '../types';

/**
 * Generate webhook signature using HMAC-SHA256
 */
export async function generateWebhookSignature(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const messageData = encoder.encode(payload);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  const hashArray = Array.from(new Uint8Array(signature));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `sha256=${hashHex}`;
}

/**
 * Deliver webhook with retry logic
 */
export async function deliverWebhook(
  env: Env,
  webhookId: string,
  url: string,
  secret: string,
  event: WebhookEvent,
  timeoutSeconds: number = 30
): Promise<{ success: boolean; status?: number; body?: string; error?: string }> {
  try {
    const payload = JSON.stringify(event);
    const signature = await generateWebhookSignature(payload, secret);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutSeconds * 1000);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-FormWeaver-Signature': signature,
        'X-FormWeaver-Event': event.type,
        'User-Agent': 'FormWeaver-Webhooks/1.0',
      },
      body: payload,
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    const responseBody = await response.text();
    
    return {
      success: response.ok,
      status: response.status,
      body: responseBody,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Calculate next retry timestamp using exponential backoff
 */
export function calculateNextRetry(attemptCount: number, baseDelaySeconds: number = 60): number {
  // Exponential backoff: 1min, 2min, 4min, 8min, etc.
  const delaySeconds = baseDelaySeconds * Math.pow(2, attemptCount - 1);
  // Add jitter (±25%) to prevent thundering herd
  const jitter = (Math.random() - 0.5) * 0.5 * delaySeconds;
  const finalDelay = Math.max(delaySeconds + jitter, 30); // Minimum 30 seconds
  
  return Date.now() + (finalDelay * 1000);
}

/**
 * Process webhook delivery with retry logic
 */
export async function processWebhookDelivery(
  env: Env,
  delivery: WebhookDelivery,
  webhook: { url: string; secret: string; retryCount: number; timeoutSeconds: number }
): Promise<void> {
  const event: WebhookEvent = {
    type: delivery.eventType,
    formId: delivery.formId,
    workspaceId: '', // Will be filled by caller
    submissionId: delivery.submissionId,
    data: delivery.payload,
    timestamp: delivery.createdAt,
  };
  
  const result = await deliverWebhook(
    env,
    delivery.webhookId,
    webhook.url,
    webhook.secret,
    event,
    webhook.timeoutSeconds
  );
  
  const now = Date.now();
  
  if (result.success) {
    // Mark as successful
    await env.DB.prepare(`
      UPDATE webhook_deliveries 
      SET status = 'success', 
          response_status = ?, 
          response_body = ?, 
          delivered_at = ?,
          updated_at = ?
      WHERE id = ?
    `).bind(
      result.status,
      result.body?.substring(0, 1000), // Limit response body size
      now,
      now,
      delivery.id
    ).run();
  } else {
    const newAttemptCount = delivery.attemptCount + 1;
    
    if (newAttemptCount >= webhook.retryCount) {
      // Mark as failed after max retries
      await env.DB.prepare(`
        UPDATE webhook_deliveries 
        SET status = 'failed', 
            response_status = ?, 
            response_body = ?, 
            error_message = ?,
            attempt_count = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(
        result.status || 0,
        result.body?.substring(0, 1000),
        result.error || 'Max retries exceeded',
        newAttemptCount,
        now,
        delivery.id
      ).run();
    } else {
      // Schedule retry
      const nextRetryAt = calculateNextRetry(newAttemptCount);
      
      await env.DB.prepare(`
        UPDATE webhook_deliveries 
        SET status = 'retrying', 
            response_status = ?, 
            response_body = ?, 
            error_message = ?,
            attempt_count = ?,
            next_retry_at = ?,
            updated_at = ?
        WHERE id = ?
      `).bind(
        result.status || 0,
        result.body?.substring(0, 1000),
        result.error || 'Delivery failed',
        newAttemptCount,
        nextRetryAt,
        now,
        delivery.id
      ).run();
    }
  }
}

/**
 * Generate a secure webhook secret
 */
export function generateWebhookSecret(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate webhook URL
 */
export function isValidWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname !== 'localhost';
  } catch {
    return false;
  }
}

/**
 * Validate webhook events
 */
export function validateWebhookEvents(events: string[]): boolean {
  const validEvents = new Set(['submission.created', 'form.published', 'form.updated']);
  return events.length > 0 && events.every(event => validEvents.has(event));
}