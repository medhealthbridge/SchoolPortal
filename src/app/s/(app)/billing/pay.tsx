"use client";

import { useActionState, useEffect } from "react";
import { Button, Callout } from "@/components/ui";
import { payInvoice, type PayResult } from "./actions";

/**
 * Sends the payer to the provider's checkout. The redirect happens in the
 * browser rather than as a server redirect because every school page is
 * served through a subdomain rewrite, which a relative redirect gets wrong.
 */
export function PayButton({ invoiceId, amount }: { invoiceId: string; amount: string }) {
  const [state, dispatch, pending] = useActionState<PayResult, FormData>(payInvoice, null);

  useEffect(() => {
    if (state?.goTo) window.location.assign(state.goTo);
  }, [state?.goTo]);

  return (
    <form action={dispatch}>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {state?.error && (
        <Callout tone="danger" title="That did not go through">
          {state.error}
        </Callout>
      )}
      <Button type="submit" size="sm" disabled={pending || Boolean(state?.goTo)}>
        {pending || state?.goTo ? "Opening…" : `Pay ${amount}`}
      </Button>
    </form>
  );
}
