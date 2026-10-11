import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Taking money for a platform invoice online, without naming a provider.
 *
 * PayMongo, Xendit, Maya and Stripe all work the same way: POST the amount
 * and a reference, get back a URL to send the payer to, and receive a signed
 * webhook when the money actually lands. So the provider is a handful of
 * environment variables — where to post, the key, a body template, and where
 * the checkout URL sits in the answer.
 *
 * Nothing here marks an invoice paid. Only the webhook does, because only the
 * provider knows whether the payment succeeded; a payer who reaches the
 * "thank you" page has not necessarily paid.
 *
 * With nothing configured, `configured()` is false, the Pay online button is
 * not rendered, and recording a bank transfer by hand stays the way it works.
 */
export function configured() {
  return Boolean(process.env.PAYMENTS_API_URL && process.env.PAYMENTS_API_KEY);
}

export type Checkout = { ok: true; url: string } | { ok: false; error: string };

export type CheckoutRequest = {
  invoiceId: string;
  amountCentavos: number;
  description: string;
  /** Where the provider sends the payer afterwards. */
  returnUrl: string;
};

export async function createCheckout(req: CheckoutRequest): Promise<Checkout> {
  if (!configured()) return { ok: false, error: "Online payment is not set up." };

  const template =
    process.env.PAYMENTS_BODY_TEMPLATE ??
    '{"data":{"attributes":{"amount":{{amount}},"description":"{{description}}",' +
      '"reference_number":"{{reference}}","redirect":{"success":"{{returnUrl}}","failed":"{{returnUrl}}"}}}}';

  const body = fill(template, {
    amount: String(req.amountCentavos),
    description: req.description,
    reference: req.invoiceId,
    returnUrl: req.returnUrl,
    key: process.env.PAYMENTS_API_KEY!,
  });

  try {
    const res = await fetch(process.env.PAYMENTS_API_URL!, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${process.env.PAYMENTS_API_KEY}:`).toString("base64")}`,
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });

    const text = await res.text();
    if (!res.ok) {
      console.error("[payments] checkout refused", res.status, text.slice(0, 300));
      return { ok: false, error: "The payment provider refused. Try again, or pay by transfer." };
    }

    const url = pluck(JSON.parse(text), process.env.PAYMENTS_CHECKOUT_URL_PATH ?? "data.attributes.checkout_url");
    if (typeof url !== "string" || !url.startsWith("https://")) {
      console.error("[payments] no checkout url in the answer", text.slice(0, 300));
      return { ok: false, error: "The payment provider answered oddly. Pay by transfer for now." };
    }
    return { ok: true, url };
  } catch (err) {
    console.error("[payments] checkout failed", err);
    return { ok: false, error: "The payment provider could not be reached." };
  }
}

/** `a.b.c` into a parsed JSON body, including `a.0.b` for arrays. */
export function pluck(value: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((at, step) => {
    if (at === null || typeof at !== "object") return undefined;
    return (at as Record<string, unknown>)[step];
  }, value);
}

function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => {
    const value = values[name] ?? "";
    // Numbers go in bare; everything else is escaped into its JSON string.
    if (name === "amount") return value;
    return JSON.stringify(value).slice(1, -1);
  });
}

/* ------------------------------------------------------------------ *
 * The webhook
 * ------------------------------------------------------------------ */

/**
 * Anyone can POST to a webhook URL. The signature is the only thing that
 * makes the difference between "the provider says this was paid" and "someone
 * found the URL", so a payload that does not verify is refused before it is
 * even parsed.
 */
export function verifySignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.PAYMENTS_WEBHOOK_SECRET ?? "";
  if (!secret || !header) return false;

  // Providers wrap it differently: "t=…,v1=<hex>", "sha256=<hex>", or bare.
  const hex = /([0-9a-f]{64})/i.exec(header)?.[1];
  if (!hex) return false;

  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(hex, "hex");
  if (given.length !== expected.length) return false;
  return timingSafeEqual(given, expected);
}

export type PaidEvent = { invoiceId: string; amountCentavos: number; reference: string };

/**
 * Pulls the three things that matter out of whatever shape the provider sends,
 * using the same configurable paths. Returns null for an event that is not a
 * successful payment — providers send many, and the rest are not ours to act
 * on.
 */
export function readPaidEvent(payload: unknown): PaidEvent | null {
  const path = (key: string, fallback: string) => process.env[key] ?? fallback;

  const type = pluck(payload, path("PAYMENTS_EVENT_TYPE_PATH", "data.attributes.type"));
  const succeeded = path("PAYMENTS_EVENT_PAID_VALUE", "payment.paid");
  if (typeof type === "string" && type !== succeeded) return null;

  const invoiceId = pluck(payload, path("PAYMENTS_REFERENCE_PATH", "data.attributes.data.attributes.reference_number"));
  const amount = pluck(payload, path("PAYMENTS_AMOUNT_PATH", "data.attributes.data.attributes.amount"));
  const reference = pluck(payload, path("PAYMENTS_PAYMENT_ID_PATH", "data.attributes.data.id"));

  if (typeof invoiceId !== "string" || !invoiceId) return null;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;

  return {
    invoiceId,
    amountCentavos: Math.round(amount),
    reference: typeof reference === "string" && reference ? reference : `${invoiceId}:${amount}`,
  };
}
