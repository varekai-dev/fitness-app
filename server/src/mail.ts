import * as tls from 'node:tls';
import { createTransport } from 'nodemailer';

import type { Env } from './index';

export type Lang = 'uk' | 'en';

const RESET_TEXT = {
  uk: {
    subject: (code: string) => `${code} — код для нового пароля`,
    body: (code: string) =>
      `Твій код для зміни пароля у GetFit: ${code}\n\nВін діє 15 хвилин. Якщо ти не просив змінити пароль, просто проігноруй цей лист.`,
  },
  en: {
    subject: (code: string) => `${code} is your password reset code`,
    body: (code: string) =>
      `Your code to reset the GetFit password: ${code}\n\nIt works for 15 minutes. If you didn’t ask to reset your password, just ignore this email.`,
  },
};

/** Sends the reset code over SMTP (Gmail with an app password by default). */
export async function sendResetCode(env: Env, to: string, code: string, lang: Lang) {
  const text = RESET_TEXT[lang];
  if (!env.SMTP_USER || !env.SMTP_PASS) {
    console.log(`No SMTP_USER / SMTP_PASS: reset code for ${to} is ${code}`);
    return;
  }
  const host = env.SMTP_HOST;
  const port = Number(env.SMTP_PORT);
  const transport = createTransport({
    host,
    port,
    // TLS from the start; Workers can't upgrade a plain socket the way STARTTLS on 587 does.
    secure: true,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  // nodemailer resolves the host and connects to its IP, which Workers refuse;
  // connecting by name works.
  transport.getSocket = (_options, callback) =>
    callback(null, { connection: tls.connect({ host, port, servername: host }), secured: true });
  await transport.sendMail({
    from: { name: env.MAIL_FROM_NAME, address: env.SMTP_USER },
    to,
    subject: text.subject(code),
    text: text.body(code),
  });
}
