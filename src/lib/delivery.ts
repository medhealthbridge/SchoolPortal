import { createTransport, type Transporter } from "nodemailer";

export type Channel = "email" | "sms" | "inapp";

export type Attempted = { status: "held" | "sent" | "failed"; error?: string };

let _transport: Transporter | null = null;

function smtpTransport(): Transporter | null {
  if (_transport) return _transport;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) return null;
  _transport = createTransport({
    host: process.env.SMTP_HOST ?? "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_PORT ?? "465") === "465",
    auth: { user, pass },
    connectionTimeout: 10_000,
    socketTimeout: 10_000,
  });
  return _transport;
}

function smsProvider() {
  const url = process.env.SMS_API_URL;
  const key = process.env.SMS_API_KEY;
  const template = process.env.SMS_BODY_TEMPLATE;
  if (!url || !key || !template) return null;
  return { url, key, from: process.env.SMS_FROM ?? "", template };
}

export function fillTemplate(
  template: string,
  values: Record<string, string | undefined>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = values[name] ?? "";
    return JSON.stringify(value).slice(1, -1);
  });
}

export async function send(message: {
  channel: Channel;
  to: string;
  subject?: string;
  body: string;
  html?: string;
}): Promise<Attempted> {
  if (message.channel === "email") return sendEmail(message);
  if (message.channel === "sms") return sendSms(message);
  return { status: "held" };
}

async function sendEmail(message: {
  to: string;
  subject?: string;
  body: string;
  html?: string;
}): Promise<Attempted> {
  const transport = smtpTransport();
  if (!transport) return { status: "held" };

  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "";

  try {
    await transport.sendMail({
      from,
      to: message.to,
      subject: message.subject ?? "",
      text: message.body,
      html: message.html ?? undefined,
    });
    return { status: "sent" };
  } catch (err) {
    return { status: "failed", error: String(err).slice(0, 500) };
  }
}

async function sendSms(message: { to: string; body: string }): Promise<Attempted> {
  const provider = smsProvider();
  if (!provider) return { status: "held" };

  const payload = fillTemplate(provider.template, {
    to: message.to,
    body: message.body,
    from: provider.from,
    key: provider.key,
  });

  try {
    const res = await fetch(provider.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.key}`,
      },
      body: payload,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => "")).slice(0, 500);
      return { status: "failed", error: `${res.status} ${res.statusText} ${detail}`.trim() };
    }
    return { status: "sent" };
  } catch (err) {
    return { status: "failed", error: String(err).slice(0, 500) };
  }
}
