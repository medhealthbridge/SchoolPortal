import { Field, Input, Select } from "@/components/ui";
import type { students } from "@/db/schema";

type Student = typeof students.$inferSelect;
export type SectionOption = { id: string; label: string };

const DISABILITIES = [
  "Visual impairment",
  "Hearing impairment",
  "Learning disability",
  "Intellectual disability",
  "Autism spectrum disorder",
  "Speech or language disorder",
  "Orthopedic or physical handicap",
  "Emotional-behavioral disorder",
  "Cerebral palsy",
  "Special health problem",
  "Multiple disabilities",
];

/** One set of fields for adding a student and for editing one. */
export function StudentFields({
  student,
  sections,
  sectionId,
}: {
  student?: Student;
  sections: SectionOption[];
  sectionId?: string;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 sm:col-span-2">
        <Field label="Student number" hint="The number your school already uses.">
          <Input name="student_number" required defaultValue={student?.studentNumber ?? ""} />
        </Field>
        <Field label="LRN" hint="The 12-digit Learner Reference Number, if the learner has one.">
          <Input
            name="lrn"
            inputMode="numeric"
            autoComplete="off"
            defaultValue={student?.lrn ?? ""}
          />
        </Field>
        <Field label="First name">
          <Input name="first_name" required defaultValue={student?.firstName ?? ""} />
        </Field>
        <Field label="Middle name">
          <Input name="middle_name" defaultValue={student?.middleName ?? ""} />
        </Field>
        <Field label="Last name">
          <Input name="last_name" required defaultValue={student?.lastName ?? ""} />
        </Field>
        <Field label="Suffix" hint="Jr., III, and so on.">
          <Input name="suffix" defaultValue={student?.suffix ?? ""} />
        </Field>
        <Field label="Birth date">
          <Input type="date" name="birth_date" defaultValue={student?.birthDate ?? ""} />
        </Field>
        <Field label="Sex">
          <Select name="sex" defaultValue={student?.sex ?? ""}>
            <option value="">Not recorded</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </Select>
        </Field>
        <Field label="Place of birth">
          <Input name="place_of_birth" defaultValue={student?.placeOfBirth ?? ""} />
        </Field>
        <Field label="PSA birth certificate no.">
          <Input name="psa_birth_cert_no" defaultValue={student?.psaBirthCertNo ?? ""} />
        </Field>
        <Field label="Section this year">
          <Select name="sectionId" defaultValue={sectionId ?? ""}>
            <option value="">Not placed yet</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 sm:col-span-2">
        <Field label="Guardian's name">
          <Input name="guardian_name" defaultValue={student?.guardianName ?? ""} />
        </Field>
        <Field label="Guardian's phone">
          <Input
            name="guardian_phone"
            type="tel"
            inputMode="tel"
            defaultValue={student?.guardianPhone ?? ""}
          />
        </Field>
        <div className="sm:col-span-2">
          <Field label="Home address">
            <Input name="address" autoComplete="off" defaultValue={student?.address ?? ""} />
          </Field>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 sm:col-span-2">
        <Field label="Mother tongue">
          <Input name="mother_tongue" defaultValue={student?.motherTongue ?? ""} />
        </Field>
        <Field label="Religion">
          <Input name="religion" defaultValue={student?.religion ?? ""} />
        </Field>
        <Field label="Indigenous group" hint="Leave blank if the learner does not belong to one.">
          <Input name="ip_group" defaultValue={student?.ipGroup ?? ""} />
        </Field>
        <Field label="Learner with a disability" hint="Leave blank if none.">
          <Input name="disability" list="disabilities" defaultValue={student?.disability ?? ""} />
          <datalist id="disabilities">
            {DISABILITIES.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </Field>
        <label className="flex min-h-11 items-center gap-3 sm:col-span-2">
          <input
            type="checkbox"
            name="four_ps"
            defaultChecked={student?.fourPs ?? false}
            className="size-5"
          />
          <span className="text-sm font-medium">
            The family is a 4Ps (Pantawid Pamilya) beneficiary
          </span>
        </label>
      </div>
    </>
  );
}
