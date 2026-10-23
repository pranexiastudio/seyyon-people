import { ActivationMailService } from './activation-mail.service';
import { getSmtpConfig } from '../../common/config/smtp.config';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
const testEnv = {
  NODE_ENV: 'production', SMTP_HOST: 'smtp.example.com', SMTP_PORT: '587',
  SMTP_USER: 'test-user', SMTP_PASSWORD: 'test-only-password', SMTP_FROM: 'invites@example.com',
  APP_WEB_URL: 'https://people.example.com',
};

describe('SMTP validation and safe delivery', () => {
  const originalEnv = process.env;
  let sendMail: jest.Mock;
  beforeEach(() => {
    process.env = { ...testEnv };
    sendMail = jest.fn().mockResolvedValue({ accepted: ['employee@example.com'], rejected: [] });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
  });
  afterEach(() => { process.env = originalEnv; jest.clearAllMocks(); });
  it('validates startup configuration and enforces authenticated TLS', () => {
    expect(() => new ActivationMailService().onModuleInit()).not.toThrow();
    const config = getSmtpConfig();
    expect(config.requireTLS).toBe(true); expect(config.tls.rejectUnauthorized).toBe(true);
    expect(config.logger).toBe(false); expect(config.debug).toBe(false);
  });
  it.each(['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'SMTP_FROM', 'APP_WEB_URL'])(
    'fails safely when %s is missing', key => {
      delete process.env[key];
      expect(() => new ActivationMailService().onModuleInit()).toThrow('Invalid activation SMTP configuration');
    });
  it.each([
    { SMTP_PORT: 'bad' }, { SMTP_PORT: '0' }, { SMTP_PORT: '65536' },
    { SMTP_FROM: 'bad\r\nBcc: other@example.com' }, { SMTP_SECURE: 'yes' },
    { APP_WEB_URL: 'http://people.example.com' }, { APP_WEB_URL: 'https://user:pass@people.example.com' },
    { APP_WEB_URL: 'https://people.example.com/path' }, { APP_WEB_URL: 'https://people.example.com/?token=x' },
  ])('rejects unsafe configuration %#', overrides => {
    expect(() => getSmtpConfig({ ...testEnv, ...overrides })).toThrow('Invalid activation SMTP configuration');
  });
  it('sends a 24-hour fragment link without returning a token or password', async () => {
    const token = 'a'.repeat(64);
    expect(await new ActivationMailService().sendInvitation('employee@example.com', token)).toBeUndefined();
    const content = sendMail.mock.calls[0][0];
    expect(content.to).toBe('employee@example.com');
    expect(content.text).toContain(`https://people.example.com/activate#token=${token}`);
    expect(content.text).toContain('24 hours');
    expect(content.text).not.toContain(testEnv.SMTP_PASSWORD);
    expect(content.text).not.toContain('?token=');
  });
  it('hides SMTP diagnostics and rejects unaccepted delivery', async () => {
    sendMail.mockRejectedValueOnce(new Error('private SMTP diagnostic'));
    await expect(new ActivationMailService().sendInvitation('employee@example.com', 'x')).rejects.toThrow('Invitation could not be sent');
    sendMail.mockResolvedValueOnce({ accepted: [], rejected: ['employee@example.com'] });
    await expect(new ActivationMailService().sendInvitation('employee@example.com', 'x')).rejects.toThrow('Invitation could not be sent');
  });
});
