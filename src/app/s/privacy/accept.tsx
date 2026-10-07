"use client";

import { useState } from "react";
import { Button, Callout } from "@/components/ui";
import { acceptPrivacy } from "./actions";

export function AcceptPrivacy({ signOut }: { signOut: () => Promise<{ goTo: string }> }) {
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {error && <Callout tone="danger">{error}</Callout>}
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 shrink-0"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>
          I have read this notice and agree to the school keeping and using my personal information, and my
          child&apos;s, as it describes.
        </span>
      </label>
      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          size="lg"
          disabled={!agreed || busy}
          onClick={async () => {
            setBusy(true);
            const out = await acceptPrivacy();
            if ("goTo" in out) window.location.assign(out.goTo);
            else {
              setError(out.error);
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving" : "I agree, continue"}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="secondary"
          onClick={async () => window.location.assign((await signOut()).goTo)}
        >
          Not now, sign out
        </Button>
      </div>
    </div>
  );
}
