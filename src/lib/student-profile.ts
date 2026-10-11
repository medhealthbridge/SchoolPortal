/**
 * The learner record the registrar keeps. One parser reads it for both the
 * manual form and the spreadsheet, so a student typed in and a student
 * imported are held to the same rules.
 *
 * The fields follow what DepEd asks for on the Basic Education Enrollment Form
 * and shows on School Form 1 (the school register).
 */

export type StudentInput = {
  studentNumber: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  suffix: string | null;
  lrn: string | null;
  birthDate: string | null;
  sex: "male" | "female" | null;
  placeOfBirth: string | null;
  motherTongue: string | null;
  religion: string | null;
  ipGroup: string | null;
  fourPs: boolean;
  disability: string | null;
  psaBirthCertNo: string | null;
  address: string | null;
  guardianName: string | null;
  guardianPhone: string | null;
  /** "Grade 7 Rizal": looked up against the school's sections, not stored here. */
  section: string | null;
};

export type StudentParse = { value: StudentInput; errors?: never } | { value?: never; errors: string[] };

const blank = (v: string | undefined) => {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  return t === "" ? null : t;
};

function parseDate(raw: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  const real =
    date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  return real ? raw : null;
}

const YES = new Set(["yes", "y", "true", "1"]);
const NO = new Set(["no", "n", "false", "0", ""]);

/** `today` is a parameter so a test does not depend on the clock. */
export function parseStudent(raw: Record<string, string | undefined>, today = new Date()): StudentParse {
  const errors: string[] = [];

  const studentNumber = blank(raw.student_number);
  const firstName = blank(raw.first_name);
  const lastName = blank(raw.last_name);
  if (!studentNumber) errors.push("Enter the school's student number.");
  if (!firstName) errors.push("Enter the first name.");
  if (!lastName) errors.push("Enter the last name.");

  let lrn = blank(raw.lrn);
  if (lrn) {
    lrn = lrn.replace(/[\s-]/g, "");
    if (!/^\d{12}$/.test(lrn)) errors.push("An LRN is 12 digits.");
  }

  let birthDate = blank(raw.birth_date);
  if (birthDate) {
    const ok = parseDate(birthDate);
    if (!ok) errors.push("Write the birth date as year-month-day, like 2012-06-30.");
    else if (new Date(`${ok}T00:00:00Z`) > today) errors.push("The birth date is in the future.");
    birthDate = ok;
  }

  let sex: StudentInput["sex"] = null;
  const sexRaw = (blank(raw.sex) ?? "").toLowerCase();
  if (sexRaw) {
    if (sexRaw === "male" || sexRaw === "m") sex = "male";
    else if (sexRaw === "female" || sexRaw === "f") sex = "female";
    else errors.push("Sex is male or female.");
  }

  const fourPsRaw = (blank(raw.four_ps) ?? "").toLowerCase();
  let fourPs = false;
  if (YES.has(fourPsRaw)) fourPs = true;
  else if (!NO.has(fourPsRaw)) errors.push("4Ps is yes or no.");

  const guardianPhone = blank(raw.guardian_phone);
  if (guardianPhone && !/^[+()\d][\d\s()+-]{6,19}$/.test(guardianPhone))
    errors.push("Check the guardian's phone number.");

  if (errors.length > 0) return { errors };

  return {
    value: {
      studentNumber: studentNumber!,
      firstName: firstName!,
      lastName: lastName!,
      middleName: blank(raw.middle_name),
      suffix: blank(raw.suffix),
      lrn,
      birthDate,
      sex,
      placeOfBirth: blank(raw.place_of_birth),
      motherTongue: blank(raw.mother_tongue),
      religion: blank(raw.religion),
      ipGroup: blank(raw.ip_group),
      fourPs,
      disability: blank(raw.disability),
      psaBirthCertNo: blank(raw.psa_birth_cert_no),
      address: blank(raw.address),
      guardianName: blank(raw.guardian_name),
      guardianPhone,
      section: blank(raw.section),
    },
  };
}

/** The spreadsheet's columns, in the order the template lists them. */
export const STUDENT_COLUMNS = [
  "student_number",
  "first_name",
  "middle_name",
  "last_name",
  "suffix",
  "lrn",
  "birth_date",
  "sex",
  "place_of_birth",
  "mother_tongue",
  "religion",
  "ip_group",
  "four_ps",
  "disability",
  "psa_birth_cert_no",
  "address",
  "guardian_name",
  "guardian_phone",
  "section",
] as const;

const EXAMPLE_ROW: Record<(typeof STUDENT_COLUMNS)[number], string> = {
  student_number: "2025-0001",
  first_name: "Maria",
  middle_name: "Santos",
  last_name: "Dela Cruz",
  suffix: "",
  lrn: "123456789012",
  birth_date: "2012-06-30",
  sex: "female",
  place_of_birth: "Quezon City",
  mother_tongue: "Tagalog",
  religion: "Roman Catholic",
  ip_group: "",
  four_ps: "no",
  disability: "",
  psa_birth_cert_no: "",
  address: "12 Rizal St, Brgy. San Roque, Quezon City",
  guardian_name: "Ana Dela Cruz",
  guardian_phone: "09171234567",
  section: "Grade 7 Rizal",
};

function cell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** A header and one worked example, so the registrar sees what each column wants. */
export function studentTemplateCsv() {
  const head = STUDENT_COLUMNS.join(",");
  const row = STUDENT_COLUMNS.map((c) => cell(EXAMPLE_ROW[c])).join(",");
  return `${head}\r\n${row}\r\n`;
}

/**
 * Sensitive personal information under the Data Privacy Act: religion,
 * indigenous group, disability and 4Ps membership. Only the registrar's own
 * screens read these; a teacher's class list never selects them.
 */
export const SENSITIVE_FIELDS = ["religion", "ipGroup", "disability", "fourPs"] as const;
