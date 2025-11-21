import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import { checkWorkspaceMembership } from '../utils/workspace';
import { 
  generateWebhookSecret, 
  isValidWebhookUrl, 
  validateWebhookEvents 
} from '../utils/webhooks';
import type { Env } from '../types';

type Variables = {
  userId: string;
  workspaceId: string;
};

const webhooks = new Hono<{ Bindings: Env; Variables: Variables }>();

const createWebhookSchema = z.object({
  url: z.string().min(1),
  events: z.array(z.string()).min(1),
  enabled: z.boolean().optional().default(true),
  retryCount: z.number().int().min(0).max(10).optional().default(3),
  timeoutSeconds: z.number().int().min(5).max(300).optional().default(30),
});

const updateWebhookSchema = z.object({
  url: z.string().min(1).optional(),
  events: z.array(z.string()).min(1).optional(),
  enabled: z.boolean().optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  timeoutSeconds: z.number().int().min(5).max(300).optional(),
});

function buildUpdateFields(updates: any): { fields: string[], values: any[] } {
  const updateFields: string[] = [];
  const updateValues: any[] = [];

  const fieldMappings = [
    { key: 'url', field: 'url = ?' },
    { key: 'events', field: 'events = ?', transform: (val: any) => JSON.stringify(val) },
    { key: 'enabled', field: 'enabled = ?', transform: (val: boolean) => val ? 1 : 0 },
    { key: 'retryCount', field: 'retry_count = ?' },
    { key: 'timeoutSeconds', field: 'timeout_seconds = ?' }
  ];

  for (const { key, field, transform } of fieldMappings) {
    if (updates[key] !== undefined) {
      updateFields.push(field);
      updateValues.push(transform ? transform(updates[key]) : updates[key]);
    }
  }

  return { fields: updateFields, values: updateValues };
}

webhooks.use('*', authMiddleware);

webhooks.post(
  '/:id/webhooks',
  zValidator('json', createWebhookSchema),
  async (c) => {
    const formId = c.req.param('id');
    const workspaceId = c.get('workspaceId');
    const { url, events, enabled, retryCount, timeoutSeconds } = c.req.valid('json');

    try {
      const membershipResult = await checkWorkspaceMembership(c, workspaceId);
      if (membershipResult instanceof Response) {
        return membershipResult;
      }

      const form = await c.env.DB.prepare(
        'SELECT id FROM forms WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL'
      ).bind(formId, workspaceId).first();

      if (!form) {
        return c.json({ error: 'Form not found' }, 404);
      }

      if (!isValidWebhookUrl(url)) {
        return c.json({ 
          error: 'Invalid webhook URL. Must be HTTPS and not localhost' 
        }, 400);
      }

      if (!validateWebhookEvents(events)) {
        return c.json({ 
          error: 'Invalid events. Supported: submission.created, form.published, form.updated' 
        }, 400);
      }

      const webhookId = crypto.randomUUID();
      const secret = generateWebhookSecret();
      const now = Date.now();

      await c.env.DB.prepare(`
        INSERT INTO webhooks (
          id, form_id, workspace_id, url, secret, events, enabled, 
          retry_count, timeout_seconds, created_at, updated_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        webhookId,
        formId,
        workspaceId,
        url,
        secret,
        JSON.stringify(events),
        enabled ? 1 : 0,
        retryCount,
        timeoutSeconds,
        now,
        now,
        membershipResult.userId
      ).run();

      return c.json({
        id: webhookId,
        formId,
        url,
        events,
        enabled,
        retryCount,
        timeoutSeconds,
        createdAt: now,
      }, 201);

    } catch (error) {
      console.error('[Webhooks] Create error:', error);
      return c.json({ error: 'Failed to create webhook' }, 500);
    }
  }
);

webhooks.get('/:id/webhooks', async (c) => {
  const formId = c.req.param('id');
  const workspaceId = c.get('workspaceId');

  try {
    const membershipResult = await checkWorkspaceMembership(c, workspaceId);
    if (membershipResult instanceof Response) {
      return membershipResult;
    }

    const form = await c.env.DB.prepare(
      'SELECT id FROM forms WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL'
    ).bind(formId, workspaceId).first();

    if (!form) {
      return c.json({ error: 'Form not found' }, 404);
    }

    const result = await c.env.DB.prepare(`
      SELECT 
        id, form_id, url, events, enabled, retry_count, 
        timeout_seconds, created_at, updated_at
      FROM webhooks 
      WHERE form_id = ? 
      ORDER BY created_at DESC
    `).bind(formId).all();

    const formattedWebhooks = result.results.map((webhook: any) => ({
      id: webhook.id,
      formId: webhook.form_id,
      url: webhook.url,
      events: JSON.parse(webhook.events as string),
      enabled: Boolean(webhook.enabled),
      retryCount: webhook.retry_count,
      timeoutSeconds: webhook.timeout_seconds,
      createdAt: webhook.created_at,
      updatedAt: webhook.updated_at,
    }));

    return c.json({ webhooks: formattedWebhooks });

  } catch (error) {
    console.error('[Webhooks] List error:', error);
    return c.json({ error: 'Failed to fetch webhooks' }, 500);
  }
});

webhooks.put(
  '/:id/webhooks/:webhookId',
  zValidator('json', updateWebhookSchema),
  async (c) => {
    const formId = c.req.param('id');
    const webhookId = c.req.param('webhookId');
    const workspaceId = c.get('workspaceId');
    const updates = c.req.valid('json');

    try {
      const membershipResult = await checkWorkspaceMembership(c, workspaceId);
      if (membershipResult instanceof Response) {
        return membershipResult;
      }

      const webhook = await c.env.DB.prepare(`
        SELECT w.id, w.form_id, w.workspace_id 
        FROM webhooks w
        JOIN forms f ON w.form_id = f.id
        WHERE w.id = ? AND w.form_id = ? AND w.workspace_id = ? AND f.deleted_at IS NULL
      `).bind(webhookId, formId, workspaceId).first();

      if (!webhook) {
        return c.json({ error: 'Webhook not found' }, 404);
      }

      if (updates.url && !isValidWebhookUrl(updates.url)) {
        return c.json({ 
          error: 'Invalid webhook URL. Must be HTTPS and not localhost' 
        }, 400);
      }

      if (updates.events && !validateWebhookEvents(updates.events)) {
        return c.json({ 
          error: 'Invalid events. Supported: submission.created, form.published, form.updated' 
        }, 400);
      }

      const { fields: updateFields, values: updateValues } = buildUpdateFields(updates);

      if (updateFields.length === 0) {
        return c.json({ error: 'No updates provided' }, 400);
      }

      updateFields.push('updated_at = ?');
      updateValues.push(Date.now(), webhookId);

      await c.env.DB.prepare(`
        UPDATE webhooks 
        SET ${updateFields.join(', ')} 
        WHERE id = ?
      `).bind(...updateValues).run();

      const updatedWebhook = await c.env.DB.prepare(`
        SELECT 
          id, form_id, url, events, enabled, retry_count, 
          timeout_seconds, created_at, updated_at
        FROM webhooks 
        WHERE id = ?
      `).bind(webhookId).first();

      if (!updatedWebhook) {
        return c.json({ error: 'Webhook not found after update' }, 404);
      }

      return c.json({
        id: updatedWebhook.id,
        formId: updatedWebhook.form_id,
        url: updatedWebhook.url,
        events: JSON.parse(updatedWebhook.events as string),
        enabled: Boolean(updatedWebhook.enabled),
        retryCount: updatedWebhook.retry_count,
        timeoutSeconds: updatedWebhook.timeout_seconds,
        createdAt: updatedWebhook.created_at,
        updatedAt: updatedWebhook.updated_at,
      });

    } catch (error) {
      console.error('[Webhooks] Update error:', error);
      return c.json({ error: 'Failed to update webhook' }, 500);
    }
  }
);

webhooks.delete('/:id/webhooks/:webhookId', async (c) => {
  const formId = c.req.param('id');
  const webhookId = c.req.param('webhookId');
  const workspaceId = c.get('workspaceId');

  try {
    const membershipResult = await checkWorkspaceMembership(c, workspaceId);
    if (membershipResult instanceof Response) {
      return membershipResult;
    }

    const webhook = await c.env.DB.prepare(`
      SELECT w.id 
      FROM webhooks w
      JOIN forms f ON w.form_id = f.id
      WHERE w.id = ? AND w.form_id = ? AND w.workspace_id = ? AND f.deleted_at IS NULL
    `).bind(webhookId, formId, workspaceId).first();

    if (!webhook) {
      return c.json({ error: 'Webhook not found' }, 404);
    }

    await c.env.DB.prepare('DELETE FROM webhooks WHERE id = ?').bind(webhookId).run();

    return c.json({ message: 'Webhook deleted successfully' });

  } catch (error) {
    console.error('[Webhooks] Delete error:', error);
    return c.json({ error: 'Failed to delete webhook' }, 500);
  }
});

export { webhooks };
export default webhooks;