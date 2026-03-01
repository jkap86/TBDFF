import { Resend } from 'resend';
import { config } from '../config';

const resend = new Resend(config.RESEND_API_KEY);

export class EmailService {
  async sendPasswordResetEmail(to: string, resetUrl: string): Promise<void> {
    await resend.emails.send({
      from: config.EMAIL_FROM,
      to,
      subject: 'Reset your TBDFF password',
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2>Password Reset</h2>
          <p>You requested a password reset for your TBDFF account.</p>
          <p>
            <a href="${resetUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600;">
              Reset Password
            </a>
          </p>
          <p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
        </div>
      `,
    });
  }
}
