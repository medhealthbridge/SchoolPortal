"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { Button, Callout } from "@/components/ui";
import type { ActionResult } from "@/components/action-form";
import { deleteStudent } from "../actions";

export function DeleteStudent({ id, name }: { id: string; name: string }) {
  const [state, dispatch, pending] = useActionState<ActionResult, FormData>(deleteStudent, null);
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) router.push("/students");
  }, [state, router]);
  return (
    <form
      action={dispatch}
      className="grid gap-3"
      onSubmit={(e) => {
        if (!window.confirm(`Delete ${name}? This cannot be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      {state?.error && <Callout tone="danger">{state.error}</Callout>}
      <div>
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Deleting" : "Delete this record"}
        </Button>
      </div>
    </form>
  );
}
