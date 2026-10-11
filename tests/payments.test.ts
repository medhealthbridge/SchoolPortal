import "../src/db/load-env";
import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { withPlatform } from "@/db";
import { invoices, payments, schools } from "@/db/schema";
import { configured, createCheckout, pluck, readPaidEvent, verifySignature } from "@/lib/payments";
import { issueInvoices, recordGatewayPayment } from "@/lib/invoicing";
import { makeSchool } from "./helpers";

const SECRET = "whsec-test";
const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("hex");

const PAID = {
  data: {
    attributes: {
      type: "payment.paid",
      data: { id: "pay_abc123", attributes: { reference_number: "", amount: 0 } },
    },
  },
};
const paidFor = (invoiceId: string, amount: number) => ({
  data: {
    attributes: {
      type: "payment.paid",
      data: { id: "pay_abc123", attributes: { reference_number: invoiceId, amount } },
    },
  },
});

afterEach(() => {
  for (const k of [
    "PAYMENTS_API_URL",
    "PAYMENTS_API_KEY",
    "PAYMENTS_WEBHOOK_SECRET",
    "PAYMENTS_BODY_TEMPLATE",
    "PAYMENTS_CHECKOUT_URL_PATH",
  ]) {
    delete process.env[k];
  }
  vi.unstubAllGlobals();
});

describe("whether online payment is on at all", () => {
  it("is off until a provider is configured, so the button never shows", () => {
    expect(configured()).toBe(false);
  });

  it("refuses to start a checkout when it is off", async () => {
    const out = await createCheckout({
      invoiceId: "i1",
      amountCentavos: 100,
      description: "x",
      returnUrl: "https://a.test",
    });
    expect(out).toEqual({ ok: false, error: "Online payment is not set up." });
  });
});

describe("starting a checkout", () => {
  const configure = () => {
    process.env.PAYMENTS_API_URL = "https://provider.test/links";
    process.env.PAYMENTS_API_KEY = "sk_test";
  };

  it("sends the amount and the invoice id, and returns where to send the payer", async () => {
    configure();
    let sent: { url: string; body: string } | null = null;
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      sent = { url: String(url), body: String(init.body) };
      return new Response(
        JSON.stringify({ data: { attributes: { checkout_url: "https://provider.test/pay/xyz" } } }),
        { status: 200 },
      );
    });

    const out = await createCheckout({
      invoiceId: "inv-1",
      amountCentavos: 929333,
      description: 'St. Mary "Academy"',
      returnUrl: "https://stmary.example/billing",
    });

    expect(out).toEqual({ ok: true, url: "https://provider.test/pay/xyz" });
    const body = JSON.parse(sent!.body);
    expect(body.data.attributes.amount).toBe(929333);
    expect(body.data.attributes.reference_number).toBe("inv-1");
    // The school's name has a quote in it; the body still has to be JSON.
    expect(body.data.attributes.description).toContain('"Academy"');
  });

  it("reports a refusal instead of sending the payer nowhere", async () => {
    configure();
    vi.stubGlobal("fetch", async () => new Response("no", { status: 422 }));
    const out = await createCheckout({
      invoiceId: "i",
      amountCentavos: 1,
      description: "x",
      returnUrl: "https://a.test",
    });
    expect(out.ok).toBe(false);
  });

  it("refuses an answer with no https url in it, rather than redirecting anywhere", async () => {
    configure();
    vi.stubGlobal("fetch", async () =>
      new Response(JSON.stringify({ data: { attributes: { checkout_url: "javascript:alert(1)" } } }), {
        status: 200,
      }),
    );
    expect((await createCheckout({ invoiceId: "i", amountCentavos: 1, description: "x", returnUrl: "https://a.test" })).ok).toBe(false);
  });
});

describe("the webhook signature", () => {
  it("refuses everything when no secret is configured", () => {
    expect(verifySignature("{}", sign("{}"))).toBe(false);
  });

  it("accepts the provider's own signature, in any of the shapes they send it", () => {
    process.env.PAYMENTS_WEBHOOK_SECRET = SECRET;
    const body = JSON.stringify(PAID);
    for (const header of [sign(body), `sha256=${sign(body)}`, `t=1700000000,v1=${sign(body)}`]) {
      expect(verifySignature(body, header)).toBe(true);
    }
  });

  it("refuses a body that was changed after it was signed", () => {
    process.env.PAYMENTS_WEBHOOK_SECRET = SECRET;
    const body = JSON.stringify(PAID);
    const tampered = body.replace("payment.paid", "payment.PAID");
    expect(verifySignature(tampered, sign(body))).toBe(false);
  });

  it("refuses a missing, empty or nonsense signature", () => {
    process.env.PAYMENTS_WEBHOOK_SECRET = SECRET;
    for (const header of [null, "", "sha256=", "not-a-signature"]) {
      expect(verifySignature("{}", header)).toBe(false);
    }
  });
});

describe("reading the event", () => {
  it("picks the invoice, the amount and the provider's payment id out of it", () => {
    expect(readPaidEvent(paidFor("inv-9", 929333))).toEqual({
      invoiceId: "inv-9",
      amountCentavos: 929333,
      reference: "pay_abc123",
    });
  });

  it("ignores every event that is not a payment landing", () => {
    const other = structuredClone(paidFor("inv-9", 100));
    other.data.attributes.type = "payment.failed";
    expect(readPaidEvent(other)).toBe(null);
  });

  it("ignores an event with no invoice or no amount, rather than guessing", () => {
    expect(readPaidEvent(paidFor("", 100))).toBe(null);
    expect(readPaidEvent(paidFor("inv-9", 0))).toBe(null);
    expect(readPaidEvent({})).toBe(null);
  });

  it("walks a path without tripping over a missing branch", () => {
    expect(pluck({ a: { b: 1 } }, "a.b")).toBe(1);
    expect(pluck({ a: null }, "a.b.c")).toBe(undefined);
  });
});

describe("recording what the gateway reported", () => {
  it("marks the invoice paid and lifts a past-due school", async () => {
    const { school } = await makeSchool();
    await withPlatform((tx) => tx.update(schools).set({ status: "past_due" }).where(eq(schools.id, school.id)));
    const period = "2031-03";
    await issueInvoices(period);
    const [invoice] = await withPlatform((tx) =>
      tx.select().from(invoices).where(and(eq(invoices.schoolId, school.id), eq(invoices.period, period))),
    );

    const out = await recordGatewayPayment({
      invoiceId: invoice!.id,
      amountCentavos: invoice!.totalCentavos,
      reference: "pay_1",
    });
    expect(out).toEqual({ duplicate: false });

    const [after] = await withPlatform((tx) =>
      tx.select().from(invoices).where(eq(invoices.id, invoice!.id)),
    );
    expect(after!.status).toBe("paid");

    const [reopened] = await withPlatform((tx) =>
      tx.select().from(schools).where(eq(schools.id, school.id)),
    );
    expect(reopened!.status).toBe("active");
  });

  it("takes the money once, however many times the provider retries", async () => {
    const { school } = await makeSchool();
    const period = "2031-04";
    await issueInvoices(period);
    const [invoice] = await withPlatform((tx) =>
      tx.select().from(invoices).where(and(eq(invoices.schoolId, school.id), eq(invoices.period, period))),
    );

    const once = { invoiceId: invoice!.id, amountCentavos: invoice!.totalCentavos, reference: "pay_2" };
    expect(await recordGatewayPayment(once)).toEqual({ duplicate: false });
    expect(await recordGatewayPayment(once)).toEqual({ duplicate: true });
    expect(await recordGatewayPayment(once)).toEqual({ duplicate: true });

    const rows = await withPlatform((tx) =>
      tx.select().from(payments).where(eq(payments.invoiceId, invoice!.id)),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.recordedByAdminId).toBe(null);
    expect(rows[0]!.method).toBe("gateway");
  });

  it("says so for an invoice that does not exist, rather than inventing one", async () => {
    const out = await recordGatewayPayment({
      invoiceId: "00000000-0000-0000-0000-000000000000",
      amountCentavos: 100,
      reference: "pay_3",
    });
    expect(out).toEqual({ error: "No such invoice." });
  });
});
