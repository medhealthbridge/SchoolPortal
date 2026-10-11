"use client";

import { useState, useTransition } from "react";
import { Button, Callout, Field, Input } from "@/components/ui";
import { acceptInvite } from "../../(app)/setup/actions";

export default function InviteForm({
  token,
  name: invitedName,
  email: invitedEmail,
}: {
  token: string;
  name: string;
  email: string;
}) {
  const [name, setName] = useState(invitedName);
  const [email, setEmail] = useState(invitedEmail);
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();

  if (message?.ok)
    return (
      <Callout tone="ok">
        {message.ok}{" "}
        <a className="font-medium underline underline-offset-2" href="/login">
          Sign in
        </a>
        .
      </Callout>
    );

  return (
    <div className="flex flex-col gap-4">
      {message?.error && <Callout tone="danger">{message.error}</Callout>}
      <Field label="Your name" htmlFor="invite-name">
        <Input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field
        label="Your email"
        htmlFor="invite-email"
        hint="This is what you sign in with, and where a forgotten password is sent. Your school filled in a guess; put your own address here."
      >
        <Input
          id="invite-email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>
      <Field label="Choose a password" htmlFor="invite-password" hint="At least 8 characters.">
        <Input
          id="invite-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={8}
        />
      </Field>
      <Button
        size="lg"
        disabled={pending || password.length < 8 || email.trim() === ""}
        onClick={() =>
          start(async () => {
            setMessage(await acceptInvite(token, name, password, email));
          })
        }
      >
        {pending ? "Creating" : "Create my account"}
      </Button>
    </div>
  );
}
