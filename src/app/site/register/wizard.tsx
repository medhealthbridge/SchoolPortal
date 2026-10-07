"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { Button, Callout, Field, Input, Panel, Section, Select } from "@/components/ui";
import { MODULES } from "@/lib/modules";
import { roleAddress, suggestSubdomain } from "@/lib/slug";
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
  // Until the person edits the address themselves, it follows the school name.
  const [addressEdited, setAddressEdited] = useState(false);
  const suggested = suggestSubdomain(schoolName);
  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "yourapp.com";
  const [availability, setAvailability] = useState<{
    available: boolean;
    reason: string | null;
  } | null>(null);

  // Step 3
  const [type, setType] = useState<"k12" | "senior_high" | "college">("k12");
  const [branchNames, setBranchNames] = useState<string[]>(["Main campus"]);
  const [logo, setLogo] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  // Step 4
  const [tier, setTier] = useState<TierKey>(
    (params.get("tier") as TierKey) ?? "starter",
  );

  const [done, setDone] = useState<{
    url: string;
    subdomain: string;
    logoNote?: string;
  } | null>(null);

  useEffect(() => {
    if (!addressEdited) setSubdomain(suggested);
  }, [suggested, addressEdited]);

  useEffect(() => {
    if (!logo) return setLogoPreview(null);
    const url = URL.createObjectURL(logo);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logo]);

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
      <Section title="Your school is live">
        <p className="text-sm">
          {schoolName} is ready at{" "}
          <a className="brand-text font-medium underline" href={done.url}>
            {done.subdomain}
          </a>
          . Sign in with {ownerEmail} to finish setup: school year and sections,
          students and staff, the timetable, invites, and the go-live checklist.
        </p>
        {done.logoNote && (
          <p className="mt-3 text-sm text-muted">
            Your logo was not saved: {done.logoNote} You can add it later in Setup, under
            School profile.
          </p>
        )}
      </Section>
    );
  }

  return (
    <div>
      {/* Four steps, in order, so the numbers are information. */}
      <ol className="mb-8 flex flex-wrap gap-x-5 gap-y-1 border-b border-line">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={`-mb-px flex items-center gap-2 border-b-2 py-2.5 ${
              i === step
                ? "border-primary font-medium text-ink"
                : "border-transparent text-muted"
            }`}
          >
            <span className="w-narrow mr-1.5 font-semibold">{i + 1}</span>
            {label}
          </li>
        ))}
      </ol>

      {error && (
        <div className="mb-4">
          <Callout tone="danger">{error}</Callout>
        </div>
      )}

      {step === 0 && (
        <Section
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
              <div className="grid gap-2 rounded-control border border-line bg-subtle p-4">
                {!codeSent ? (
                  <>
                    <p className="text-sm text-muted">
                      We send a code to that address and check it before the
                      school is created.
                    </p>
                  <Button
                    type="button"
                    variant="secondary"
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
                  </>
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

            {emailVerified && <Callout tone="ok">Email verified.</Callout>}

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
        </Section>
      )}

      {step === 1 && (
        <Section title="Your address" subtitle="Checked live; reserved words are blocked.">
          <Field label="Subdomain">
            <div className="flex items-center gap-2">
              <Input
                value={subdomain}
                placeholder={suggested || "your-school"}
                onChange={(e) => {
                  setAddressEdited(true);
                  setSubdomain(e.target.value.toLowerCase());
                }}
              />
              <span className="shrink-0 text-sm text-muted">.{root}</span>
            </div>
          </Field>
          <p className="mt-2 text-sm text-muted">
            {suggested && !addressEdited
              ? `Made from “${schoolName.trim()}”. Change it if you like. `
              : ""}
            Staff will sign in at{" "}
            <span className="font-medium text-ink">
              {subdomain || suggested || "your-school"}.{root}
            </span>
            , with addresses like{" "}
            <span className="font-medium text-ink">
              {roleAddress("teacher", subdomain || suggested || "your-school", root)}
            </span>
            .
          </p>
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
        </Section>
      )}

      {step === 2 && (
        <Section
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
                className="w-full rounded-[2px] border border-line border-b-2 border-b-[var(--ink-soft)] bg-surface px-3 py-2 text-sm"
                rows={3}
                value={branchNames.join("\n")}
                onChange={(e) => setBranchNames(e.target.value.split("\n"))}
              />
            </Field>
            <Field
              label="School logo (optional)"
              hint="PNG, JPEG or WebP, up to 2 MB. It shows in the corner of every screen. You can add or change it later in Setup."
            >
              <div className="flex items-center gap-4">
                {logoPreview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoPreview}
                    alt="Your logo"
                    className="size-14 shrink-0 rounded-control border border-line object-contain"
                  />
                )}
                <input
                  type="file"
                  name="logo"
                  accept="image/png,image/jpeg,image/webp"
                  className="block w-full max-w-full text-sm"
                  onChange={(e) => setLogo(e.target.files?.[0] ?? null)}
                />
              </div>
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
        </Section>
      )}

      {step === 3 && (
        <Section title="Tier" subtitle="A free trial starts here. You can change tier later.">
          <div className="grid gap-3">
            {TIER_LIST.map((t) => (
              <label
                key={t.key}
                className={`flex cursor-pointer items-start gap-3 rounded-control border p-4 ${
                  tier === t.key ? "border-primary bg-subtle" : "border-line bg-surface"
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
                    {t.name}, {peso(t.platformFeeCentavos)} a year
                  </span>
                  <span className="block text-sm text-muted">
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
              variant="primary"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const logoForm = new FormData();
                  if (logo) logoForm.set("logo", logo);
                  const res = await registerSchool(
                    {
                      schoolName,
                      ownerName,
                      ownerEmail,
                      ownerMobile,
                      password,
                      subdomain,
                      type,
                      branchNames: branchNames.map((b) => b.trim()).filter(Boolean),
                      tier,
                    },
                    logoForm,
                  );
                  if (!res.ok) return setError(res.error);
                  setDone({ url: res.url, subdomain: res.subdomain, logoNote: res.logoNote });
                })
              }
            >
              {pending ? "Creating…" : "Create my school"}
            </Button>
          </div>
        </Section>
      )}
    </div>
  );
}
