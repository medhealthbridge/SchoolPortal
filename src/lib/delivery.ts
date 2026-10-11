export type Channel = "email" | "sms" | "inapp";

export type Attempted = { status: "held" | "sent" | "failed"; error?: string };

type Provider = { url: string; key: string; from: string; template: string };

/**
 * Mail and SMS without a dependency and without picking a vendor.
 *
 * Every provider worth using in the Philippines — Semaphore, Movider, Twilio,
 * Resend, Postmark — takes a JSON POST with a bearer key or the key in the
 * body. So the provider is four environment variables: where to post, the
 * key, who it is from, and a template naming that provider's fields. Switching
 * provider is an env change, not a deploy.
 *
 * With nothing configured, nothing is sent and the message stays "held" in the
 * outbox. That is the right behaviour for dev and tests, and it means a
 * half-configured production sends nothing rather than something wrong.
 */
function providerFor(channel: Channel): Provider | null {
  const prefix = channel === "email" ? "EMAIL" : channel === "sms" ? "SMS" : null;
  if (!prefix) return null; // in-app notifications never leave the building

  const url = process.env[`${prefix}_API_URL`];
  const key = process.env[`${prefix}_API_KEY`];
  const template = process.env[`${prefix}_BODY_TEMPLATE`];
  if (!url || !key || !template) return null;

  return { url, key, from: process.env[`${prefix}_FROM`] ?? "", template };
}

/** Fills {{to}}, {{subject}}, {{body}}, {{from}} and {{key}}, JSON-escaped. */
export function fillTemplate(
  template: string,
  values: Record<string, string | undefined>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = values[name] ?? "";
    // JSON.stringify gives us the escaping; the quotes are already in the
    // template, so drop the pair it adds.
    return JSON.stringify(value).slice(1, -1);
  });
}

export async function send(message: {
  channel: Channel;
  to: string;
  subject?: string;
  body: string;
}): Promise<Attempted> {
  const provider = providerFor(message.channel);
  if (!provider) return { status: "held" };

  const payload = fillTemplate(provider.template, {
    to: message.to,
    subject: message.subject ?? "",
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
      // A parent waiting on an absence alert is better served by a failure
      // recorded in ten seconds than by a request that hangs the page.
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
