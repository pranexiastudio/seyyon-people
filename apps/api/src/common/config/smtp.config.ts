import { isEmail } from 'class-validator';

export function getSmtpConfig(env: NodeJS.ProcessEnv = process.env) {
  const fail = () => { throw new Error('Invalid activation SMTP configuration. Check SMTP settings and APP_WEB_URL.'); };
  const port = Number(env.SMTP_PORT || 587);
  const secure = env.SMTP_SECURE === 'true';
  if (!env.SMTP_HOST?.trim() || !env.SMTP_USER || !env.SMTP_PASSWORD
    || !env.SMTP_FROM || !isEmail(env.SMTP_FROM) || /[\r\n]/.test(env.SMTP_FROM)
    || !Number.isInteger(port) || port < 1 || port > 65535
    || (env.SMTP_SECURE !== undefined && !['true', 'false'].includes(env.SMTP_SECURE))) fail();
  let webUrl: URL;
  try { webUrl = new URL(env.APP_WEB_URL || ''); } catch { fail(); }
  if (webUrl.username || webUrl.password || webUrl.search || webUrl.hash
    || webUrl.pathname !== '/' || !['https:', 'http:'].includes(webUrl.protocol)
    || (webUrl.protocol !== 'https:' && (env.NODE_ENV === 'production'
      || !['localhost', '127.0.0.1', '[::1]'].includes(webUrl.hostname)))) fail();
  return {
    host: env.SMTP_HOST.trim(), port, secure, requireTLS: !secure,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    tls: { rejectUnauthorized: true },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
    logger: false as const, debug: false,
    from: env.SMTP_FROM, webOrigin: webUrl.origin,
  };
}
