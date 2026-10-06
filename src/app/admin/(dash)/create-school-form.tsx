"use client";

import { useActionState, useRef, useState } from "react";
import { Button, Callout, Field, Input, Select } from "@/components/ui";
import { suggestSubdomain } from "@/lib/slug";
import { createSchool, type CreateSchoolResult } from "./create-school";

export function CreateSchoolForm({ root }: { root: string }) {
  const [state, action, pending] = useActionState<CreateSchoolResult, FormData>(createSchool, null);
  const address = useRef<HTMLInputElement>(null);
  const edited = useRef(false);
  const [copied, setCopied] = useState(false);

  return (
    <div className="grid gap-4">
      {state && "error" in state && <Callout tone="danger">{state.error}</Callout>}
      {state && "ok" in state && (
        <Callout tone="ok" title={state.ok}>
          <span className="block">
            Send the owner this link to choose their password. It works once, for 7 days:
          </span>
          <span className="mt-1 block break-all font-mono text-[13px] text-ink">{state.setPassword}</span>
          <span className="mt-2 block">
            They sign in afterwards at <span className="font-medium text-ink">{state.signIn}</span>
          </span>
          <span className="mt-3 block">
            <Button
              type="button"
              variant="secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(state.setPassword);
                  setCopied(true);
                } catch {
                  setCopied(false);
                }
              }}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
          </span>
        </Callout>
      )}
      <form action={action} className="grid gap-4 sm:grid-cols-2">
        <Field label="School name">
          <Input
            name="name"
            required
            autoComplete="off"
            onChange={(e) => {
              if (!edited.current && address.current)
                address.current.value = suggestSubdomain(e.target.value);
            }}
          />
        </Field>
        <Field label="Address" hint={`The part before .${root.split(":")[0]}`}>
          <Input ref={address} name="subdomain" required autoComplete="off" onChange={() => (edited.current = true)} />
        </Field>
        <Field label="Owner's name">
          <Input name="ownerName" required autoComplete="off" />
        </Field>
        <Field label="Owner's email" hint="Their sign-in.">
          <Input name="ownerEmail" type="email" required autoComplete="off" />
        </Field>
        <Field label="Plan">
          <Select name="tier" defaultValue="all_in">
            <option value="starter">Starter</option>
            <option value="academic">Academic</option>
            <option value="student_life">Student life</option>
            <option value="all_in">All-in</option>
          </Select>
        </Field>
        <Field label="School type">
          <Select name="type" defaultValue="k12">
            <option value="k12">K-12</option>
            <option value="senior_high">Senior high</option>
            <option value="college">College</option>
          </Select>
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating" : "Create school"}
          </Button>
        </div>
      </form>
    </div>
  );
}
