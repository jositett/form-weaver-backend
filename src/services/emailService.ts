import { Resend } from 'resend';
import type { Env } from '../types/index';

export interface EmailTemplate {
  subject: string;
  html: string;
  text?: string;
}

export interface SendEmailOptions {
  to: string;
  template: EmailTemplate;
  from?: string;
}

export class EmailService {
  private resend: Resend;
  private fromEmail: string;

  constructor(env: Env) {
    // Initialize Resend client
    if (!env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY environment variable is required');
    }

    this.resend = new Resend(env.RESEND_API_KEY);
    this.fromEmail = env.FROM_EMAIL || 'FormWeaver <noreply@formweaver.com>';
  }

  /**
   * Send a verification email to a new user
   */
  async sendVerificationEmail(
    to: string,
    verificationToken: string,
    userName: string
  ): Promise<boolean> {
    try {
      const verificationUrl = this.buildVerificationUrl(verificationToken);
      
      const template = this.createVerificationTemplate(userName, verificationUrl);
      
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });

      // Check if email was sent successfully
      if (response.error) {
        console.error('[Email Service] Verification email failed:', response.error);
        return false;
      }

      console.log('[Email Service] Verification email sent successfully to:', to);
      return true;
    } catch (error) {
      console.error('[Email Service] Error sending verification email:', error);
      return false;
    }
  }

  /**
   * Send a password reset email
   */
  async sendPasswordResetEmail(
    to: string,
    resetToken: string,
    userName: string
  ): Promise<boolean> {
    try {
      const resetUrl = this.buildResetUrl(resetToken);
      
      const template = this.createPasswordResetTemplate(userName, resetUrl);
      
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });

      if (response.error) {
        console.error('[Email Service] Password reset email failed:', response.error);
        return false;
      }

      console.log('[Email Service] Password reset email sent successfully to:', to);
      return true;
    } catch (error) {
      console.error('[Email Service] Error sending password reset email:', error);
      return false;
    }
  }

  /**
   * Send a notification email for form submissions
   */
  async sendFormNotificationEmail(
    to: string,
    formTitle: string,
    submissionData: Record<string, any>,
    workspaceName?: string
  ): Promise<boolean> {
    try {
      const template = this.createFormNotificationTemplate(
        formTitle,
        submissionData,
        workspaceName || 'Your Workspace'
      );
      
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });

      if (response.error) {
        console.error('[Email Service] Form notification email failed:', response.error);
        return false;
      }

      console.log('[Email Service] Form notification email sent successfully to:', to);
      return true;
    } catch (error) {
      console.error('[Email Service] Error sending form notification email:', error);
      return false;
    }
  }

  /**
   * Build verification URL
   */
  private buildVerificationUrl(token: string): string {
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://formweaver.com' 
      : 'http://localhost:8081';
    return `${baseUrl}/verify-email?token=${token}`;
  }

  /**
   * Build password reset URL
   */
  private buildResetUrl(token: string): string {
    const baseUrl = process.env.NODE_ENV === 'production' 
      ? 'https://formweaver.com' 
      : 'http://localhost:8081';
    return `${baseUrl}/reset-password?token=${token}`;
  }

  /**
   * Create verification email template
   */
  private createVerificationTemplate(userName: string, verificationUrl: string): EmailTemplate {
    const subject = 'Verify your FormWeaver account';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verify Your Account</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 20px 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 8px; }
          .button { display: inline-block; padding: 12px 24px; background: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>FormWeaver</h1>
          </div>
          <div class="content">
            <h2>Welcome to FormWeaver, ${userName}!</h2>
            <p>Thank you for signing up. To complete your registration and start creating beautiful forms, please verify your email address by clicking the button below:</p>
            <div style="text-align: center;">
              <a href="${verificationUrl}" class="button">Verify Your Email</a>
            </div>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #e9ecef; padding: 10px; border-radius: 4px;">${verificationUrl}</p>
            <p>This verification link will expire in 24 hours for security reasons.</p>
          </div>
          <div class="footer">
            <p>If you didn't create an account with FormWeaver, you can safely ignore this email.</p>
            <p>&copy; 2025 FormWeaver. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `Welcome to FormWeaver, ${userName}!

Thank you for signing up. To complete your registration, please verify your email address by visiting this link:

${verificationUrl}

This verification link will expire in 24 hours for security reasons.

If you didn't create an account with FormWeaver, you can safely ignore this email.

Best regards,
The FormWeaver Team`;

    return { subject, html, text };
  }

  /**
   * Create password reset email template
   */
  private createPasswordResetTemplate(userName: string, resetUrl: string): EmailTemplate {
    const subject = 'Reset your FormWeaver password';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reset Your Password</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 20px 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 8px; }
          .button { display: inline-block; padding: 12px 24px; background: #dc3545; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>FormWeaver</h1>
          </div>
          <div class="content">
            <h2>Password Reset Request</h2>
            <p>Hi ${userName},</p>
            <p>We received a request to reset the password for your FormWeaver account. If you made this request, click the button below to reset your password:</p>
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Your Password</a>
            </div>
            <p>If the button doesn't work, you can copy and paste this link into your browser:</p>
            <p style="word-break: break-all; background: #e9ecef; padding: 10px; border-radius: 4px;">${resetUrl}</p>
            <div class="warning">
              <strong>Security Note:</strong> This reset link will expire in 1 hour for security reasons. If you didn't request a password reset, please ignore this email and your account remains secure.
            </div>
          </div>
          <div class="footer">
            <p>If you didn't request a password reset, you can safely ignore this email.</p>
            <p>&copy; 2025 FormWeaver. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `Password Reset Request

Hi ${userName},

We received a request to reset the password for your FormWeaver account. If you made this request, visit this link to reset your password:

${resetUrl}

Security Note: This reset link will expire in 1 hour for security reasons. If you didn't request a password reset, please ignore this email and your account remains secure.

Best regards,
The FormWeaver Team`;

    return { subject, html, text };
  }

  /**
   * Create form notification email template
   */
  private createFormNotificationTemplate(
    formTitle: string,
    submissionData: Record<string, any>,
    workspaceName: string
  ): EmailTemplate {
    const subject = `New submission for form: ${formTitle}`;
    
    // Format submission data for display
    const submissionDetails = Object.entries(submissionData)
      .map(([key, value]) => `${key}: ${value}`)
      .join('\n');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Form Submission</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; padding: 20px 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 8px; }
          .submission-data { background: white; padding: 20px; border-radius: 4px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>FormWeaver</h1>
          </div>
          <div class="content">
            <h2>New Form Submission</h2>
            <p>Hi there,</p>
            <p>You have a new submission for your form <strong>"${formTitle}"</strong> in <strong>${workspaceName}</strong>.</p>
            <div class="submission-data">
              <h3>Submission Details:</h3>
              <pre style="white-space: pre-wrap; margin: 0;">${submissionDetails}</pre>
            </div>
            <p>You can view and manage all submissions in your FormWeaver dashboard.</p>
          </div>
          <div class="footer">
            <p>&copy; 2025 FormWeaver. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    const text = `New Form Submission

Hi there,

You have a new submission for your form: "${formTitle}" in ${workspaceName}.

Submission Details:
${submissionDetails}

You can view and manage all submissions in your FormWeaver dashboard.

Best regards,
The FormWeaver Team`;

    return { subject, html, text };
  }
}

/**
 * Create email service instance
 */
export const createEmailService = (env: Env): EmailService => {
  return new EmailService(env);
};

/**
 * Send email verification (convenience function)
 */
export const sendEmailVerification = async (
  env: Env,
  to: string,
  verificationToken: string,
  userName: string
): Promise<boolean> => {
  const emailService = createEmailService(env);
  return emailService.sendVerificationEmail(to, verificationToken, userName);
};

/**
 * Send password reset email (convenience function)
 */
export const sendPasswordResetEmail = async (
  env: Env,
  to: string,
  resetToken: string,
  userName: string
): Promise<boolean> => {
  const emailService = createEmailService(env);
  return emailService.sendPasswordResetEmail(to, resetToken, userName);
};

/**
 * Send form notification email (convenience function)
 */
export const sendFormNotification = async (
  env: Env,
  to: string,
  formTitle: string,
  submissionData: Record<string, any>,
  workspaceName?: string
): Promise<boolean> => {
  const emailService = createEmailService(env);
  return emailService.sendFormNotificationEmail(to, formTitle, submissionData, workspaceName);
};


/**
 * Send profile change notification email (convenience function)
 */
export const sendProfileChangeNotification = async (
  env: Env,
  to: string,
  userId: string,
  changeType: 'email_changed' | 'account_deleted',
  details: Record<string, any> = {}
): Promise<boolean> => {
  try {
    const emailService = createEmailService(env);
    
    let subject: string;
    let html: string;
    let text: string;
    
    if (changeType === 'email_changed') {
      subject = 'Your FormWeaver email address has been changed';
      const oldEmail = details.oldEmail as string || '';
      
      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Email Address Changed</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 8px; }
            .warning { background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>FormWeaver</h1>
            </div>
            <div class="content">
              <h2>Email Address Changed</h2>
              <p>Your FormWeaver account email address has been changed.</p>
              <p><strong>Old Email:</strong> ${oldEmail}</p>
              <p><strong>New Email:</strong> ${to}</p>
              <div class="warning">
                <strong>Security Notice:</strong> If you didn't make this change, please contact our support team immediately and secure your account.
              </div>
              <p>You can now use your new email address to log in to your FormWeaver account.</p>
            </div>
            <div class="footer">
              <p>&copy; 2025 FormWeaver. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      text = `Email Address Changed

Your FormWeaver account email address has been changed.

Old Email: ${oldEmail}
New Email: ${to}

Security Notice: If you didn't make this change, please contact our support team immediately and secure your account.

You can now use your new email address to log in to your FormWeaver account.

Best regards,
The FormWeaver Team`;
    } else if (changeType === 'account_deleted') {
      subject = 'Your FormWeaver account has been deleted';
      
      html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Account Deleted</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { text-align: center; padding: 20px 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 8px; }
            .warning { background: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 4px; margin: 20px 0; color: #721c24; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>FormWeaver</h1>
            </div>
            <div class="content">
              <h2>Account Deletion Confirmation</h2>
              <p>We're writing to confirm that your FormWeaver account has been permanently deleted.</p>
              <div class="warning">
                <strong>Important:</strong> This action cannot be reversed. All your data, including forms, submissions, and workspace information, has been permanently removed from our systems.
              </div>
              <p>If you believe this deletion was unauthorized or if you have any questions, please contact our support team immediately.</p>
            </div>
            <div class="footer">
              <p>&copy; 2025 FormWeaver. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      text = `Account Deletion Confirmation

We're writing to confirm that your FormWeaver account has been permanently deleted.

Important: This action cannot be reversed. All your data, including forms, submissions, and workspace information, has been permanently removed from our systems.

If you believe this deletion was unauthorized or if you have any questions, please contact our support team immediately.

Best regards,
The FormWeaver Team`;
    } else {
      return false;
    }
    
    const template = { subject, html, text };
    
    const response = await emailService['resend'].emails.send({
      from: emailService['fromEmail'],
      to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    if (response.error) {
      console.error('[Email Service] Profile change notification failed:', response.error);
      return false;
    }

    console.log('[Email Service] Profile change notification sent successfully to:', to);
    return true;
  } catch (error) {
    console.error('[Email Service] Error sending profile change notification:', error);
    return false;
  }
};