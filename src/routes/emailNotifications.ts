import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import { checkWorkspaceMembership } from '../utils/workspace';
import type { Env, HonoContext } from '../types/index';
import { getDb } from '../db/db';

// --- Types ---

// --- Zod Schemas ---

const formIdParamSchema = z.object({
  id: z.string().min(1).max(50),
});

const createNotificationSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  notifyOnSubmission: z.boolean().default(true),
  notifyOnDailySummary: z.boolean().default(false),
  notifyOnWeeklyReport: z.boolean().default(false),
  recipientEmails: z.array(z.string().email()).min(1).max(10),
  emailTemplateId: z.string().optional(),
});

const updateNotificationSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  notifyOnSubmission: z.boolean().optional(),
  notifyOnDailySummary: z.boolean().optional(),
  notifyOnWeeklyReport: z.boolean().optional(),
  recipientEmails: z.array(z.string().email()).min(1).max(10).optional(),
  emailTemplateId: z.string().optional(),
});

const testEmailSchema = z.object({
  recipientEmail: z.string().email(),
  templateType: z.enum(['submission', 'daily_summary', 'weekly_report']).default('submission'),
});

// --- Email Service Integration ---

/**
 * Send email notification using external service (Resend, SendGrid, etc.)
 * This is a placeholder implementation - integrate with your preferred email service
 */
async function sendEmail(
  _env: Env,
  to: string,
  subject: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    // TODO: Integrate with actual email service
    // Example with Resend:
    // const response = await fetch('https://api.resend.com/emails', {
    //   method: 'POST',
    //   headers: {
    //     'Authorization': `Bearer ${env.RESEND_API_KEY}`,
    //     'Content-Type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     from: 'FormWeaver <noreply@formweaver.app>',
    //     to: [to],
    //     subject,
    //     html: htmlBody,
    //     text: textBody,
    //   }),
    // });

    // For now, simulate email sending
    console.log(`[Email Simulation] To: ${to}, Subject: ${subject}`);
    
    // Simulate success/failure (90% success rate)
    const success = Math.random() > 0.1;
    
    if (success) {
      return {
        success: true,
        messageId: `sim_${crypto.randomUUID()}`,
      };
    } else {
      return {
        success: false,
        error: 'Simulated email service error',
      };
    }
  } catch (error) {
    console.error('[Email Service Error]', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown email service error',
    };
  }
}

/**
 * Generate email content from template
 */
function generateEmailContent(
  templateType: 'submission' | 'daily_summary' | 'weekly_report',
  formTitle: string,
  data: any
): { subject: string; htmlBody: string; textBody: string } {
  switch (templateType) {
    case 'submission':
      return {
        subject: `New submission received for "${formTitle}"`,
        htmlBody: `
          <h2>New Form Submission</h2>
          <p>You have received a new submission for your form "<strong>${formTitle}</strong>".</p>
          <h3>Submission Details:</h3>
          <pre>${JSON.stringify(data, null, 2)}</pre>
          <p>View all submissions in your <a href="https://formweaver.app/dashboard">FormWeaver dashboard</a>.</p>
        `,
        textBody: `New Form Submission\n\nYou have received a new submission for your form "${formTitle}".\n\nSubmission Details:\n${JSON.stringify(data, null, 2)}\n\nView all submissions in your FormWeaver dashboard: https://formweaver.app/dashboard`,
      };
    
    case 'daily_summary':
      return {
        subject: `Daily summary for "${formTitle}"`,
        htmlBody: `
          <h2>Daily Form Summary</h2>
          <p>Here's your daily summary for "<strong>${formTitle}</strong>".</p>
          <ul>
            <li>Total submissions today: ${data.submissionsToday || 0}</li>
            <li>Total views today: ${data.viewsToday || 0}</li>
            <li>Conversion rate: ${((data.submissionsToday || 0) / Math.max(data.viewsToday || 1, 1) * 100).toFixed(1)}%</li>
          </ul>
          <p>View detailed analytics in your <a href="https://formweaver.app/dashboard">FormWeaver dashboard</a>.</p>
        `,
        textBody: `Daily Form Summary\n\nHere's your daily summary for "${formTitle}".\n\nTotal submissions today: ${data.submissionsToday || 0}\nTotal views today: ${data.viewsToday || 0}\nConversion rate: ${((data.submissionsToday || 0) / Math.max(data.viewsToday || 1, 1) * 100).toFixed(1)}%\n\nView detailed analytics in your FormWeaver dashboard: https://formweaver.app/dashboard`,
      };
    
    case 'weekly_report':
      return {
        subject: `Weekly report for "${formTitle}"`,
        htmlBody: `
          <h2>Weekly Form Report</h2>
          <p>Here's your weekly report for "<strong>${formTitle}</strong>".</p>
          <ul>
            <li>Total submissions this week: ${data.submissionsThisWeek || 0}</li>
            <li>Total views this week: ${data.viewsThisWeek || 0}</li>
            <li>Average daily submissions: ${((data.submissionsThisWeek || 0) / 7).toFixed(1)}</li>
            <li>Conversion rate: ${((data.submissionsThisWeek || 0) / Math.max(data.viewsThisWeek || 1, 1) * 100).toFixed(1)}%</li>
          </ul>
          <p>View detailed analytics in your <a href="https://formweaver.app/dashboard">FormWeaver dashboard</a>.</p>
        `,
        textBody: `Weekly Form Report\n\nHere's your weekly report for "${formTitle}".\n\nTotal submissions this week: ${data.submissionsThisWeek || 0}\nTotal views this week: ${data.viewsThisWeek || 0}\nAverage daily submissions: ${((data.submissionsThisWeek || 0) / 7).toFixed(1)}\nConversion rate: ${((data.submissionsThisWeek || 0) / Math.max(data.viewsThisWeek || 1, 1) * 100).toFixed(1)}%\n\nView detailed analytics in your FormWeaver dashboard: https://formweaver.app/dashboard`,
      };
    
    default:
      throw new Error(`Unknown template type: ${templateType}`);
  }
}

// --- Email Notifications Router ---

const emailNotificationsRouter = new Hono<{
  Bindings: Env;
  Variables: HonoContext;
}>();

/**
 * POST /:id/notifications - Configure email notifications for a form
 */
emailNotificationsRouter.post(
  '/notifications',
  authMiddleware,
  zValidator('param', formIdParamSchema),
  zValidator('json', createNotificationSettingsSchema),
  async (c) => {
    const { id: formId } = c.req.valid('param');
    const settings = c.req.valid('json');
    const userId = c.get('userId')!;
    const workspaceId = c.get('workspaceId')!;

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const db = getDb(c.env);

      // Verify form exists and belongs to workspace
      const form = await db.prepare(
        'SELECT id, title FROM forms WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL'
      ).bind(formId, workspaceId).first();

      if (!form) {
        return c.json({
          success: false,
          error: 'Form not found',
        }, 404);
      }

      // Check if notification settings already exist
      const existingSettings = await db.prepare(
        'SELECT id FROM form_notifications WHERE form_id = ?'
      ).bind(formId).first();

      if (existingSettings) {
        return c.json({
          success: false,
          error: 'Notification settings already exist for this form. Use PUT to update.',
        }, 409);
      }

      // Create notification settings
      const now = Date.now();
      const settingsId = crypto.randomUUID();

      await db.prepare(`
        INSERT INTO form_notifications (
          id, form_id, workspace_id, enabled, notify_on_submission,
          notify_on_daily_summary, notify_on_weekly_report, recipient_emails,
          email_template_id, created_at, updated_at, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        settingsId,
        formId,
        workspaceId,
        settings.enabled,
        settings.notifyOnSubmission,
        settings.notifyOnDailySummary,
        settings.notifyOnWeeklyReport,
        JSON.stringify(settings.recipientEmails),
        settings.emailTemplateId || null,
        Math.floor(now / 1000),
        Math.floor(now / 1000),
        userId
      ).run();

      return c.json({
        success: true,
        data: {
          id: settingsId,
          formId,
          workspaceId,
          enabled: settings.enabled,
          notifyOnSubmission: settings.notifyOnSubmission,
          notifyOnDailySummary: settings.notifyOnDailySummary,
          notifyOnWeeklyReport: settings.notifyOnWeeklyReport,
          recipientEmails: settings.recipientEmails,
          emailTemplateId: settings.emailTemplateId,
          createdAt: now,
          updatedAt: now,
          createdBy: userId,
        },
        message: 'Email notification settings created successfully',
      }, 201);

    } catch (error) {
      console.error('[Create Email Notifications Error]', error);
      return c.json({
        success: false,
        error: 'Failed to create email notification settings',
      }, 500);
    }
  }
);

/**
 * GET /:id/notifications - Get email notification settings for a form
 */
emailNotificationsRouter.get(
  '/notifications',
  authMiddleware,
  zValidator('param', formIdParamSchema),
  async (c) => {
    const { id: formId } = c.req.valid('param');
    const workspaceId = c.get('workspaceId')!;

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const db = getDb(c.env);

      // Get notification settings
      const settings = await db.prepare(`
        SELECT 
          id, form_id, workspace_id, enabled, notify_on_submission,
          notify_on_daily_summary, notify_on_weekly_report, recipient_emails,
          email_template_id, created_at, updated_at, created_by
        FROM form_notifications 
        WHERE form_id = ?
      `).bind(formId).first();

      if (!settings) {
        return c.json({
          success: false,
          error: 'No notification settings found for this form',
        }, 404);
      }

      const recipientEmails = JSON.parse(settings.recipient_emails as string);

      return c.json({
        success: true,
        data: {
          id: settings.id,
          formId: settings.form_id,
          workspaceId: settings.workspace_id,
          enabled: Boolean(settings.enabled),
          notifyOnSubmission: Boolean(settings.notify_on_submission),
          notifyOnDailySummary: Boolean(settings.notify_on_daily_summary),
          notifyOnWeeklyReport: Boolean(settings.notify_on_weekly_report),
          recipientEmails,
          emailTemplateId: settings.email_template_id,
          createdAt: (settings.created_at as number) * 1000,
          updatedAt: (settings.updated_at as number) * 1000,
          createdBy: settings.created_by,
        },
      });

    } catch (error) {
      console.error('[Get Email Notifications Error]', error);
      return c.json({
        success: false,
        error: 'Failed to get email notification settings',
      }, 500);
    }
  }
);

/**
 * PUT /:id/notifications - Update email notification settings for a form
 */
emailNotificationsRouter.put(
  '/notifications',
  authMiddleware,
  zValidator('param', formIdParamSchema),
  zValidator('json', updateNotificationSettingsSchema),
  async (c) => {
    const { id: formId } = c.req.valid('param');
    const updates = c.req.valid('json');
    const workspaceId = c.get('workspaceId')!;

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const db = getDb(c.env);

      // Get existing settings
      const existingSettings = await db.prepare(
        'SELECT * FROM form_notifications WHERE form_id = ?'
      ).bind(formId).first();

      if (!existingSettings) {
        return c.json({
          success: false,
          error: 'No notification settings found for this form',
        }, 404);
      }

      // Build update query dynamically
      const updateFields: string[] = [];
      const updateValues: any[] = [];

      if (updates.enabled !== undefined) {
        updateFields.push('enabled = ?');
        updateValues.push(updates.enabled);
      }
      if (updates.notifyOnSubmission !== undefined) {
        updateFields.push('notify_on_submission = ?');
        updateValues.push(updates.notifyOnSubmission);
      }
      if (updates.notifyOnDailySummary !== undefined) {
        updateFields.push('notify_on_daily_summary = ?');
        updateValues.push(updates.notifyOnDailySummary);
      }
      if (updates.notifyOnWeeklyReport !== undefined) {
        updateFields.push('notify_on_weekly_report = ?');
        updateValues.push(updates.notifyOnWeeklyReport);
      }
      if (updates.recipientEmails !== undefined) {
        updateFields.push('recipient_emails = ?');
        updateValues.push(JSON.stringify(updates.recipientEmails));
      }
      if (updates.emailTemplateId !== undefined) {
        updateFields.push('email_template_id = ?');
        updateValues.push(updates.emailTemplateId);
      }

      if (updateFields.length === 0) {
        return c.json({
          success: false,
          error: 'No valid fields to update',
        }, 400);
      }

      // Add updated_at
      updateFields.push('updated_at = ?');
      updateValues.push(Math.floor(Date.now() / 1000));

      // Add WHERE clause
      updateValues.push(formId);

      const updateQuery = `
        UPDATE form_notifications 
        SET ${updateFields.join(', ')} 
        WHERE form_id = ?
      `;

      await db.prepare(updateQuery).bind(...updateValues).run();

      // Get updated settings
      const updatedSettings = await db.prepare(`
        SELECT 
          id, form_id, workspace_id, enabled, notify_on_submission,
          notify_on_daily_summary, notify_on_weekly_report, recipient_emails,
          email_template_id, created_at, updated_at, created_by
        FROM form_notifications 
        WHERE form_id = ?
      `).bind(formId).first();

      const recipientEmails = JSON.parse(updatedSettings!.recipient_emails as string);

      return c.json({
        success: true,
        data: {
          id: updatedSettings!.id,
          formId: updatedSettings!.form_id,
          workspaceId: updatedSettings!.workspace_id,
          enabled: Boolean(updatedSettings!.enabled),
          notifyOnSubmission: Boolean(updatedSettings!.notify_on_submission),
          notifyOnDailySummary: Boolean(updatedSettings!.notify_on_daily_summary),
          notifyOnWeeklyReport: Boolean(updatedSettings!.notify_on_weekly_report),
          recipientEmails,
          emailTemplateId: updatedSettings!.email_template_id,
          createdAt: (updatedSettings!.created_at as number) * 1000,
          updatedAt: (updatedSettings!.updated_at as number) * 1000,
          createdBy: updatedSettings!.created_by,
        },
        message: 'Email notification settings updated successfully',
      });

    } catch (error) {
      console.error('[Update Email Notifications Error]', error);
      return c.json({
        success: false,
        error: 'Failed to update email notification settings',
      }, 500);
    }
  }
);

/**
 * DELETE /:id/notifications - Delete email notification settings for a form
 */
emailNotificationsRouter.delete(
  '/notifications',
  authMiddleware,
  zValidator('param', formIdParamSchema),
  async (c) => {
    const { id: formId } = c.req.valid('param');
    const workspaceId = c.get('workspaceId')!;

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const db = getDb(c.env);

      // Check if settings exist
      const existingSettings = await db.prepare(
        'SELECT id FROM form_notifications WHERE form_id = ?'
      ).bind(formId).first();

      if (!existingSettings) {
        return c.json({
          success: false,
          error: 'No notification settings found for this form',
        }, 404);
      }

      // Delete notification settings
      await db.prepare(
        'DELETE FROM form_notifications WHERE form_id = ?'
      ).bind(formId).run();

      return c.json({
        success: true,
        message: 'Email notification settings deleted successfully',
      });

    } catch (error) {
      console.error('[Delete Email Notifications Error]', error);
      return c.json({
        success: false,
        error: 'Failed to delete email notification settings',
      }, 500);
    }
  }
);

/**
 * POST /:id/notifications/test - Send test email notification
 */
emailNotificationsRouter.post(
  '/notifications/test',
  authMiddleware,
  zValidator('param', formIdParamSchema),
  zValidator('json', testEmailSchema),
  async (c) => {
    const { id: formId } = c.req.valid('param');
    const { recipientEmail, templateType } = c.req.valid('json');
    const workspaceId = c.get('workspaceId')!;

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const db = getDb(c.env);

      // Get form details
      const form = await db.prepare(
        'SELECT id, title FROM forms WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL'
      ).bind(formId, workspaceId).first();

      if (!form) {
        return c.json({
          success: false,
          error: 'Form not found',
        }, 404);
      }

      // Generate test email content
      const testData = {
        submissionsToday: 5,
        viewsToday: 25,
        submissionsThisWeek: 32,
        viewsThisWeek: 180,
        testSubmission: {
          name: 'John Doe',
          email: 'john@example.com',
          message: 'This is a test submission for email notification testing.',
        },
      };

      const emailContent = generateEmailContent(templateType, form.title as string, testData);

      // Send test email
      const emailResult = await sendEmail(
        c.env,
        recipientEmail,
        `[TEST] ${emailContent.subject}`,
        emailContent.htmlBody,
        emailContent.textBody
      );

      if (!emailResult.success) {
        return c.json({
          success: false,
          error: `Failed to send test email: ${emailResult.error}`,
        }, 500);
      }

      // Log the test email in notification history
      const historyId = crypto.randomUUID();
      await db.prepare(`
        INSERT INTO notification_history (
          id, form_id, workspace_id, notification_type, recipient_email,
          subject, status, sent_at, email_service_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        historyId,
        formId,
        workspaceId,
        `test_${templateType}`,
        recipientEmail,
        emailContent.subject,
        'sent',
        Math.floor(Date.now() / 1000),
        emailResult.messageId,
        Math.floor(Date.now() / 1000)
      ).run();

      return c.json({
        success: true,
        data: {
          messageId: emailResult.messageId,
          recipientEmail,
          templateType,
          subject: emailContent.subject,
        },
        message: 'Test email sent successfully',
      });

    } catch (error) {
      console.error('[Send Test Email Error]', error);
      return c.json({
        success: false,
        error: 'Failed to send test email',
      }, 500);
    }
  }
);

/**
 * GET /:id/notifications/history - Get notification history for a form
 */
emailNotificationsRouter.get(
  '/notifications/history',
  authMiddleware,
  zValidator('param', formIdParamSchema),
  async (c) => {
    const { id: formId } = c.req.valid('param');
    const workspaceId = c.get('workspaceId')!;

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const db = getDb(c.env);

      // Get notification history with pagination
      const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100);
      const offset = parseInt(c.req.query('offset') || '0');

      const history = await db.prepare(`
        SELECT 
          id, form_id, workspace_id, notification_type, recipient_email,
          subject, status, sent_at, error_message, submission_id,
          email_service_id, created_at
        FROM notification_history 
        WHERE form_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).bind(formId, limit, offset).all();

      const totalCount = await db.prepare(
        'SELECT COUNT(id) as count FROM notification_history WHERE form_id = ?'
      ).bind(formId).first();

      return c.json({
        success: true,
        data: {
          history: history.results.map((record: any) => ({
            id: record.id,
            formId: record.form_id,
            workspaceId: record.workspace_id,
            notificationType: record.notification_type,
            recipientEmail: record.recipient_email,
            subject: record.subject,
            status: record.status,
            sentAt: record.sent_at ? record.sent_at * 1000 : null,
            errorMessage: record.error_message,
            submissionId: record.submission_id,
            emailServiceId: record.email_service_id,
            createdAt: record.created_at * 1000,
          })),
          pagination: {
            limit,
            offset,
            total: (totalCount as any)?.count || 0,
            hasMore: ((totalCount as any)?.count || 0) > offset + limit,
          },
        },
      });

    } catch (error) {
      console.error('[Get Notification History Error]', error);
      return c.json({
        success: false,
        error: 'Failed to get notification history',
      }, 500);
    }
  }
);

export default emailNotificationsRouter;

/**
 * Utility function to send submission notification
 * Called from the submissions route when a new submission is received
 */
export async function sendSubmissionNotification(
  env: Env,
  formId: string,
  submissionData: any
): Promise<void> {
  try {
    const db = getDb(env);

    // Get notification settings for the form
    const settings = await db.prepare(`
      SELECT 
        enabled, notify_on_submission, recipient_emails
      FROM form_notifications 
      WHERE form_id = ? AND enabled = true AND notify_on_submission = true
    `).bind(formId).first();

    if (!settings) {
      return; // No notification settings or notifications disabled
    }

    // Get form details
    const form = await db.prepare(
      'SELECT title FROM forms WHERE id = ?'
    ).bind(formId).first();

    if (!form) {
      return;
    }

    const recipientEmails = JSON.parse(settings.recipient_emails as string) as string[];
    const emailContent = generateEmailContent('submission', form.title as string, submissionData);

    // Send emails to all recipients
    for (const email of recipientEmails) {
      const emailResult = await sendEmail(
        env,
        email,
        emailContent.subject,
        emailContent.htmlBody,
        emailContent.textBody
      );

      // Log notification history
      const historyId = crypto.randomUUID();
      await db.prepare(`
        INSERT INTO notification_history (
          id, form_id, workspace_id, notification_type, recipient_email,
          subject, status, sent_at, error_message, email_service_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        historyId,
        formId,
        '', // workspace_id would need to be passed in
        'submission',
        email,
        emailContent.subject,
        emailResult.success ? 'sent' : 'failed',
        emailResult.success ? Math.floor(Date.now() / 1000) : null,
        emailResult.error || null,
        emailResult.messageId || null,
        Math.floor(Date.now() / 1000)
      ).run();
    }
  } catch (error) {
    console.error('[Send Submission Notification Error]', error);
    // Don't throw - notification failures shouldn't break form submission
  }
}