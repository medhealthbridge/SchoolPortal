"use client";

import { useState, type FormEvent } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";

const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "lvh.me:3000";

/**
 * "stmary", "stmary.example.com" and a pasted "https://stmary.example.com/login"
 * are all the same answer. Anything else is not a school address.
 */
export function schoolFrom(input: string, root: string): string | null {
  let value = input.trim().toLowerCase().replace(/^https?:\/\//, "");
  // Drop the path, then a port — and only a port: a colon followed by anything
  // else is not part of an address we would send somebody to.
  value = value.split(/[/?#]/)[0]!.replace(/:\d+$/, "");
  const host = root.split(":")[0]!;
  if (value.endsWith(`.${host}`)) value = value.slice(0, -(host.length + 1));
  return /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(value) ? value : null;
}

export function FindSchool() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function go(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const school = schoolFrom(value, ROOT);
    if (!school) {
      setError(`That is not a school address. It is the part before .${ROOT.split(":")[0]}, like stmary.`);
      return;
    }
    const protocol = ROOT.includes("lvh.me") || ROOT.startsWith("localhost") ? "http" : "https";
    window.location.assign(`${protocol}://${school}.${ROOT}/login`);
  }

  return (
    <form onSubmit={go} className="flex flex-col gap-4">
      {error && <Callout tone="danger">{error}</Callout>}
      <Field
        label="Your school's address"
        htmlFor="school"
        hint={`It is the first part of the web address your school was given, before .${ROOT.split(":")[0]}.`}
      >
        <Input
          id="school"
          name="school"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          inputMode="url"
          placeholder="stmary"
          required
        />
      </Field>
      <Button type="submit" size="lg">
        Go to my school
      </Button>
    </form>
  );
}
