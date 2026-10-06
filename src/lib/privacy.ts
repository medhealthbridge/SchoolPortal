/**
 * The school's privacy notice and each person's consent to it, as the Data
 * Privacy Act of 2012 (RA 10173) asks of a school that keeps learners'
 * personal information.
 *
 * Everyone is asked once, on their first visit, and again whenever the school
 * changes the notice. Nothing else in the portal opens until they answer.
 */
import type { School } from "./tenant";

export function standardNotice(school: Pick<School, "name">) {
  return `${school.name} collects and keeps the personal information of its learners, their parents or guardians, and its staff in order to enrol learners, teach and assess them, keep attendance and conduct records, issue report cards and school forms, collect fees, keep everyone safe, and report to the Department of Education as the law requires.

What we keep: names, learner reference numbers, dates and places of birth, sex, addresses, contact numbers and email addresses, family and guardian details, grades, attendance, conduct and guidance records, and fee and payment records.

Who sees it: only the school staff whose work needs it, the learner, and the learner's linked parents or guardians. Guidance records are seen only by the guidance office. We share information with the Department of Education and other government offices only when the law requires it, and we never sell it.

How long we keep it: for as long as the learner is enrolled, and afterwards for as long as DepEd's records rules require.

Your rights: you may ask to see the personal information we keep about you or your child, have it corrected, object to its use, or ask for it to be deleted where the law allows, and you may complain to the National Privacy Commission.`;
}

export function noticeOf(school: Pick<School, "name" | "privacyNotice">) {
  return school.privacyNotice?.trim() || standardNotice(school);
}

export function needsConsent(
  school: Pick<School, "privacyNoticeVersion">,
  user: { privacyConsentVersion: number | null },
) {
  return (user.privacyConsentVersion ?? 0) < school.privacyNoticeVersion;
}
