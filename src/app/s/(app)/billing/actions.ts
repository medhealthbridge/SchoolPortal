"use server";

import { and, eq } from "drizzle-orm";
import { withTenant } from "@/db";
import { invoices } from "@/db/schema";
import { requirePermission } from "@/lib/guard";
import { createCheckout } from "@/lib/payments";
import { peso } from "@/lib/pricing";

export type PayResult = { error?: string; goTo?: string } | null;

/**
 * Hands the payer to the provider's own checkout page. Nothing is marked paid
 * here — the webhook does that when the money actually lands.
 *
 * The invoice is read inside this school's tenant context, so the id in the
 * form can only ever name one of its own invoices.
 */
export async function payInvoice(_prev: PayResult, form: FormData): Promise<PayResult> {
  const { school } = await requirePermission("school.billing.view");
  const invoiceId = String(form.get("invoiceId") ?? "");

  const [invoice] = await withTenant(school.id, (tx) =>
    tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.schoolId, school.id), eq(invoices.id, invoiceId)))
      .limit(1),
  );
  if (!invoice) return { error: "No such invoice." };
  if (invoice.status === "paid") return { error: "That invoice is already paid." };

  const root = process.env.ROOT_DOMAIN ?? "lvh.me:3000";
  const protocol = root.includes("lvh.me") || root.startsWith("localhost") ? "http" : "https";

  const checkout = await createCheckout({
    invoiceId: invoice.id,
    amountCentavos: invoice.totalCentavos,
    description: `${school.name} — ${invoice.period} (${peso(invoice.totalCentavos)})`,
    returnUrl: `${protocol}://${school.subdomain}.${root}/billing`,
  });

  if (!checkout.ok) return { error: checkout.error };
  return { goTo: checkout.url };
}
