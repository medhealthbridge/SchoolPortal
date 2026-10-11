"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Button, Callout, Field, Input, Select } from "@/components/ui";
import { applyOnline, type EnrolResult } from "./actions";

export function EnrolForm({ levels, schoolName }: { levels: string[]; schoolName: string }) {
  const [state, action, pending] = useActionState<EnrolResult, FormData>(applyOnline, null);
  if (state?.reference)
    return (
      <Callout tone="ok" title={`Application sent. Your reference is ${state.reference}`}>
        Keep it: with your mobile number it shows where the application stands, on{" "}
        <Link href="/enrol/status">Check an application</Link>. {schoolName}&apos;s registrar will contact you.
      </Callout>
    );
  return (
    <form action={action} className="grid gap-6">
      {state?.error && (
        <Callout tone="danger" title={state.error}>
          {state.issues && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {state.issues.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          )}
        </Callout>
      )}
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-semibold">The learner</legend>
        <Field label="Applying for">
          <Select name="grade_level" required defaultValue="">
            <option value="" disabled>
              Choose a grade
            </option>
            {levels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="LRN" hint="12 digits, if the learner has one from a previous school.">
          <Input name="lrn" inputMode="numeric" autoComplete="off" />
        </Field>
        <Field label="First name">
          <Input name="first_name" required autoComplete="off" />
        </Field>
        <Field label="Middle name">
          <Input name="middle_name" autoComplete="off" />
        </Field>
        <Field label="Last name">
          <Input name="last_name" required autoComplete="off" />
        </Field>
        <Field label="Suffix" hint="Jr., III. Optional.">
          <Input name="suffix" autoComplete="off" />
        </Field>
        <Field label="Birth date">
          <Input name="birth_date" type="date" required />
        </Field>
        <Field label="Sex">
          <Select name="sex" defaultValue="">
            <option value="">—</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </Select>
        </Field>
        <Field label="Place of birth">
          <Input name="place_of_birth" autoComplete="off" />
        </Field>
        <Field label="PSA birth certificate number" hint="Optional.">
          <Input name="psa_birth_cert_no" autoComplete="off" />
        </Field>
        <Field label="Mother tongue">
          <Input name="mother_tongue" autoComplete="off" />
        </Field>
        <Field label="Religion" hint="Optional.">
          <Input name="religion" autoComplete="off" />
        </Field>
        <Field label="Indigenous peoples community" hint="If any.">
          <Input name="ip_group" autoComplete="off" />
        </Field>
        <Field label="Disability or special need" hint="If any, so the school can prepare.">
          <Input name="disability" autoComplete="off" />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Home address">
            <Input name="address" autoComplete="street-address" />
          </Field>
        </div>
        <Field label="Last school attended" hint="Optional.">
          <Input name="previous_school" autoComplete="off" />
        </Field>
        <label className="flex min-h-11 items-center gap-3 self-end text-sm">
          <input type="checkbox" name="four_ps" value="yes" className="h-5 w-5" />
          The family is a 4Ps beneficiary
        </label>
      </fieldset>
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-semibold">Parent or guardian</legend>
        <Field label="Full name">
          <Input name="guardian_name" required autoComplete="name" />
        </Field>
        <Field label="Relationship" hint="Mother, father, grandparent, guardian.">
          <Input name="guardian_relationship" autoComplete="off" />
        </Field>
        <Field label="Mobile number" hint="The school texts updates here.">
          <Input name="guardian_phone" type="tel" required autoComplete="tel" placeholder="0917 123 4567" />
        </Field>
        <Field label="Email" hint="Optional.">
          <Input name="guardian_email" type="email" autoComplete="email" />
        </Field>
      </fieldset>
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" name="consent" value="yes" required className="mt-0.5 h-5 w-5 shrink-0" />
        <span>
          I have read the school&apos;s <Link href="/privacy">privacy notice</Link> and agree to it keeping this
          information to process the application.
        </span>
      </label>
      <div>
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? "Sending" : "Send the application"}
        </Button>
      </div>
    </form>
  );
}
