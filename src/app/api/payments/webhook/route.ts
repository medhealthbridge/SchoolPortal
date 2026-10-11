import { NextResponse } from "next/server";
import { readPaidEvent, verifySignature } from "@/lib/payments";
import { recordGatewayPayment } from "@/lib/invoicing";

export const dynamic = "force-dynamic";

/**
 * Where the payment provider reports that money arrived. This is the only
 * thing that marks an invoice paid: a payer landing back on a thank-you page
 * has not necessarily paid, and the browser is not a witness.
 *
 * The body is read as raw text and verified before it is parsed — a signature
 * is over the bytes that were sent, and anyone can POST here.
 *
 * Middleware does not rewrite /api/payments, so the provider can be pointed
 * at the bare domain.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  const signature =
    req.headers.get("paymongo-signature") ??
    req.headers.get("x-signature") ??
    req.headers.get("stripe-signature") ??
    req.headers.get("x-callback-signature");

  if (!verifySignature(raw, signature)) {
    console.warn("[payments] rejected a webhook with no valid signature");
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Not JSON." }, { status: 400 });
  }

  const paid = readPaidEvent(payload);
  // A verified event that is not a successful payment is still the provider
  // talking to us: answer 200 so it stops retrying something we will never
  // act on.
  if (!paid) return NextResponse.json({ ok: true, ignored: true });

  const outcome = await recordGatewayPayment(paid);
  if ("error" in outcome) {
    // 404 of our own making — an unknown invoice id is not worth a retry.
    console.error("[payments]", outcome.error, paid);
    return NextResponse.json({ error: outcome.error }, { status: 200 });
  }

  console.log("[payments] recorded", paid.invoiceId, outcome.duplicate ? "(already had it)" : "");
  return NextResponse.json({ ok: true, duplicate: outcome.duplicate });
}
