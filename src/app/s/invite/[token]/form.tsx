"use client";

import { useState, useTransition } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { acceptInvite } from "../../(app)/setup/actions";

export default function InviteForm({ token }: { token: string }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      {message?.error && <Callout tone="danger">{message.error}</Callout>}
      {message?.ok && (
        <Callout tone="ok">
          {message.ok}{" "}
          <a className="font-medium underline underline-offset-2" href="/login">
            Sign in
          </a>
          .
        </Callout>
      )}
      <Field label="Your name" htmlFor="invite-name">
        <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Choose a password" htmlFor="invite-password" hint="At least 8 characters.">
        <Input
          id="invite-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
        />
      </Field>
      <Button
        size="lg"
        disabled={pending || password.length < 8}
        onClick={() =>
          start(async () => {
            const res = await acceptInvite(token, name, password);
            setMessage(res);
          })
        }
      >
        {pending ? "Creating" : "Create my account"}
      </Button>
    </div>
  );
}
