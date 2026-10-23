import { Injectable, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { getSmtpConfig } from '../../common/config/smtp.config';

@Injectable()
export class ActivationMailService implements OnModuleInit {
  onModuleInit() { getSmtpConfig(); }

  async sendInvitation(email: string, token: string): Promise<void> {
    try {
      const { from, webOrigin, ...options } = getSmtpConfig();
      const transport = nodemailer.createTransport(options);
      const link = `${webOrigin}/activate#token=${encodeURIComponent(token)}`;
      const result = await transport.sendMail({
        from, to: email, subject: 'Activate your Seyyon People account',
        text: `You have been invited to Seyyon People. Set your password using this link:\n\n${link}\n\nThis link expires in 24 hours and can be used once. If you did not expect this invitation, ignore this email.`,
      });
      if (!result.accepted?.length || result.rejected?.length) throw new Error('Delivery not accepted');
    } catch {
      // Never forward SMTP diagnostics (they can include credentials or message contents).
      throw new ServiceUnavailableException('Invitation could not be sent. Please try again later.');
    }
  }
}
