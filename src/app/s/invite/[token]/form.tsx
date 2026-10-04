"use client";

import { useState, useTransition } from "react";
import { Banner, Button, Field, Input } from "@/components/ui";
import { acceptInvite } from "../../(app)/setup/actions";

export default function InviteForm({ token }: { token: string }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="grid gap-4">
      {message?.error && <Banner tone="danger">{message.error}</Banner>}
      {message?.ok && (
        <Banner>
          {message.ok}{" "}
          <a className="font-medium underline" href="/login">
            Sign in
          </a>
          .
        </Banner>
      )}
      <Field label="Your name">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Choose a password">
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
        />
      </Field>
      <Button
        disabled={pending || password.length < 8}
        onClick={() =>
          start(async () => {
            const res = await acceptInvite(token, name, password);
            setMessage(res);
          })
        }
      >
        {pending ? "Creating…" : "Create my account"}
      </Button>
    </div>
  );
}
