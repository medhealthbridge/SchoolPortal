"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Banner, Button, Card, Field, Input, Select } from "@/components/ui";
import { MODULES } from "@/lib/modules";
import { TIER_LIST, peso } from "@/lib/pricing";
import {
  checkSubdomain,
  registerSchool,
  sendVerificationCode,
  verifyEmailCode,
} from "./actions";

type TierKey = (typeof TIER_LIST)[number]["key"];

const STEPS = [
  "Owner and email",
  "Your address",
  "School details",
  "Tier",
] as const;

export default function RegisterWizard() {
  const params = useSearchParams();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Step 1
  const [schoolName, setSchoolName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerMobile, setOwnerMobile] = useState("");
  const [password, setPassword] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [code, setCode] = useState("");
  const [emailVerified, setEmailVerified] = useState(false);

  // Step 2
  const [subdomain, setSubdomain] = useState("");
  const [availability, setAvailability] = useState<{
    available: boolean;
    reason: string | null;
  } | null>(null);

  // Step 3
  const [type, setType] = useState<"k12" | "senior_high" | "college">("k12");
  const [branchNames, setBranchNames] = useState<string[]>(["Main campus"]);

  // Step 4
  const [tier, setTier] = useState<TierKey>(
    (params.get("tier") as TierKey) ?? "starter",
  );

  const [done, setDone] = useState<{ url: string; subdomain: string } | null>(null);

  // Availability is checked live, as the spec asks, with a short debounce.
  useEffect(() => {
    if (!subdomain) {
      setAvailability(null);
      return;
    }
    const t = setTimeout(() => {
      checkSubdomain(subdomain).then(setAvailability);
    }, 300);
    return () => clearTimeout(t);
  }, [subdomain]);

  if (done) {
    return (
      <Card title="Your school is live">
        <p className="text-sm">
          {schoolName} is ready at{" "}
          <a className="brand-text font-medium underline" href={done.url}>
            {done.subdomain}
          </a>
          . Sign in with {ownerEmail} to finish setup: school year and sections,
          students and staff, the timetable, invites, and the go-live checklist.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <ol className="mb-6 flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={`rounded-full px-3 py-1 ${
              i === step
                ? "brand-bg text-white"
                : i < step
                  ? "bg-brand-100 text-[#1b3049]"
                  : "border border-black/15 text-black/55 dark:border-white/20 dark:text-white/55"
            }`}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {error && (
        <div className="mb-4">
          <Banner tone="danger">{error}</Banner>
        </div>
      )}

      {step === 0 && (
        <Card
          title="Owner and email"
          subtitle="The email is verified before anything else."
        >
          <div className="grid gap-4">
            <Field label="School name">
              <Input value={schoolName} onChange={(e) => setSchoolName(e.target.value)} />
            </Field>
            <Field label="Owner name">
              <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
            </Field>
            <Field label="Owner email">
              <Input
                type="email"
                value={ownerEmail}
                onChange={(e) => {
                  setOwnerEmail(e.target.value);
                  setEmailVerified(false);
                  setCodeSent(false);
                }}
              />
            </Field>
            <Field label="Mobile number">
              <Input value={ownerMobile} onChange={(e) => setOwnerMobile(e.target.value)} />
            </Field>
            <Field label="Password" hint="At least 8 characters.">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>

            {!emailVerified && (
              <div className="rounded-lg border border-black/10 p-4 dark:border-white/15">
                {!codeSent ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending || !ownerEmail}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await sendVerificationCode(ownerEmail);
                        if (!res.ok) return setError(res.error);
                        setError(null);
                        setCodeSent(true);
                        setDevCode(res.devCode);
                      })
                    }
                  >
                    Send verification code
                  </Button>
                ) : (
                  <div className="grid gap-3">
                    <Field
                      label="Verification code"
                      hint={devCode ? `No mail provider wired up yet — your code is ${devCode}.` : undefined}
                    >
                      <Input value={code} onChange={(e) => setCode(e.target.value)} />
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={pending || code.length < 4}
                      onClick={() =>
                        startTransition(async () => {
                          const res = await verifyEmailCode(ownerEmail, code);
                          if (!res.ok) return setError(res.error);
                          setError(null);
                          setEmailVerified(true);
                        })
                      }
                    >
                      Verify
                    </Button>
                  </div>
                )}
              </div>
            )}

            {emailVerified && <Banner>Email verified.</Banner>}

            <div>
              <Button
                disabled={
                  !emailVerified ||
                  !schoolName ||
                  !ownerName ||
                  !ownerMobile ||
                  password.length < 8
                }
                onClick={() => setStep(1)}
              >
                Continue
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card title="Your address" subtitle="Checked live; reserved words are blocked.">
          <Field label="Subdomain">
            <div className="flex items-center gap-2">
              <Input
                value={subdomain}
                placeholder="stmary"
                onChange={(e) => setSubdomain(e.target.value.toLowerCase())}
              />
              <span className="shrink-0 text-sm text-black/60 dark:text-white/60">
                .{process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "yourapp.com"}
              </span>
            </div>
          </Field>
          {availability && (
            <p
              className={`mt-2 text-sm ${availability.available ? "text-[#1f7a4d]" : "text-[#b3261e]"}`}
            >
              {availability.available ? "Available." : availability.reason}
            </p>
          )}
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button disabled={!availability?.available} onClick={() => setStep(2)}>
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card
          title="School details"
          subtitle="The type sets defaults such as level names and grading periods."
        >
          <div className="grid gap-4">
            <Field label="School type">
              <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
                <option value="k12">K-12</option>
                <option value="senior_high">Senior high</option>
                <option value="college">College</option>
              </Select>
            </Field>
            <Field label="Branches" hint="One per line. The first is the main campus.">
              <textarea
                className="w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm dark:border-white/20 dark:bg-white/5"
                rows={3}
                value={branchNames.join("\n")}
                onChange={(e) => setBranchNames(e.target.value.split("\n"))}
              />
            </Field>
          </div>
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button
              disabled={branchNames.filter((b) => b.trim()).length === 0}
              onClick={() => setStep(3)}
            >
              Continue
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card title="Tier" subtitle="A free trial starts here. You can change tier later.">
          <div className="grid gap-3">
            {TIER_LIST.map((t) => (
              <label
                key={t.key}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 ${
                  tier === t.key
                    ? "border-[var(--brand)] bg-brand-50"
                    : "border-black/10 dark:border-white/15"
                }`}
              >
                <input
                  type="radio"
                  name="tier"
                  className="mt-1"
                  checked={tier === t.key}
                  onChange={() => setTier(t.key)}
                />
                <span>
                  <span className="block font-medium">
                    {t.name} · {peso(t.platformFeeCentavos)} per year
                  </span>
                  <span className="block text-sm text-black/65 dark:text-white/65">
                    {t.modules.map((m) => MODULES[m].name).join(", ")}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-5 flex gap-2">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button
              variant="accent"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const res = await registerSchool({
                    schoolName,
                    ownerName,
                    ownerEmail,
                    ownerMobile,
                    password,
                    subdomain,
                    type,
                    branchNames: branchNames.map((b) => b.trim()).filter(Boolean),
                    tier,
                  });
                  if (!res.ok) return setError(res.error);
                  setDone({ url: res.url, subdomain: res.subdomain });
                })
              }
            >
              {pending ? "Creating…" : "Create my school"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
