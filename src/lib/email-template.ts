/**
 * HTML email templates for SchoolPortal.
 *
 * Every email uses the same wrapper: the school's colour as an accent, the
 * school name in the header, a clear body, and a muted footer. The design
 * works in Gmail, Outlook, Apple Mail, and phone mail apps.
 */

type TemplateOptions = {
  schoolName?: string;
  accentColor?: string;
};

const ACCENT = "#2563eb";
const BG = "#f8fafc";
const CARD_BG = "#ffffff";
const TEXT = "#1e293b";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";

function layout(
  opts: TemplateOptions,
  heading: string,
  bodyHtml: string,
  footerExtra?: string,
): string {
  const accent = opts.accentColor || ACCENT;
  const school = opts.schoolName ?? "SchoolPortal";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${heading}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-text-size-adjust:100%">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}">
<tr><td align="center" style="padding:32px 16px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
    <!-- Header bar -->
    <tr><td style="background:${accent};border-radius:12px 12px 0 0;padding:20px 28px">
      <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.02em">${escapeHtml(school)}</span>
    </td></tr>
    <!-- Body card -->
    <tr><td style="background:${CARD_BG};padding:28px 28px 24px;border-left:1px solid ${BORDER};border-right:1px solid ${BORDER}">
      <h1 style="margin:0 0 16px;font-size:20px;font-weight:700;color:${TEXT};line-height:1.3">${heading}</h1>
      <div style="font-size:15px;line-height:1.6;color:${TEXT}">
        ${bodyHtml}
      </div>
    </td></tr>
    <!-- Footer -->
    <tr><td style="background:${CARD_BG};padding:0 28px 24px;border-left:1px solid ${BORDER};border-right:1px solid ${BORDER};border-radius:0 0 12px 12px;border-bottom:1px solid ${BORDER}">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td style="border-top:1px solid ${BORDER};padding-top:16px">
          <p style="margin:0;font-size:12px;color:${MUTED};line-height:1.5">
            ${footerExtra ? `${footerExtra}<br>` : ""}Sent by SchoolPortal &middot; This is an automated message, please do not reply directly.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function button(label: string, url: string, color?: string): string {
  const bg = color || ACCENT;
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0">
<tr><td style="background:${bg};border-radius:8px;padding:0">
  <a href="${escapeHtml(url)}" target="_blank" style="display:inline-block;padding:12px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px">
    ${escapeHtml(label)}
  </a>
</td></tr>
</table>`;
}

function codeBlock(code: string): string {
  return `<div style="background:#f1f5f9;border:1px solid ${BORDER};border-radius:8px;padding:16px 20px;margin:16px 0;text-align:center">
  <span style="font-size:28px;font-weight:700;letter-spacing:0.15em;color:${TEXT};font-family:monospace">${escapeHtml(code)}</span>
</div>`;
}

function p(text: string): string {
  return `<p style="margin:0 0 12px">${text}</p>`;
}

export const emailTemplates = {
  verificationCode(code: string, opts: TemplateOptions = {}) {
    return layout(
      opts,
      "Your verification code",
      p("Use this code to verify your email address:") +
        codeBlock(code) +
        p(`It expires in <strong>30 minutes</strong>. If you didn't request this, you can safely ignore this email.`),
    );
  },

  schoolLive(
    school: { name: string; subdomain: string; email: string },
    loginUrl: string,
    opts: TemplateOptions = {},
  ) {
    return layout(
      { ...opts, schoolName: school.name },
      "Your school is live!",
      p(`<strong>${escapeHtml(school.name)}</strong> is set up and ready to go on SchoolPortal.`) +
        p(`Sign in with <strong>${escapeHtml(school.email)}</strong> to start adding your students, teachers, and classes.`) +
        button("Go to your school", loginUrl),
      escapeHtml(school.name),
    );
  },

  passwordReset(
    school: { name: string },
    resetUrl: string,
    opts: TemplateOptions = {},
  ) {
    return layout(
      { ...opts, schoolName: school.name },
      "Set a new password",
      p(`Someone asked to reset your password at <strong>${escapeHtml(school.name)}</strong>.`) +
        p("If it was you, click the button below. The link works for one hour.") +
        button("Set new password", resetUrl) +
        p(`<span style="color:${MUTED}">If you didn't ask for this, ignore this email. Your password won't change.</span>`),
      escapeHtml(school.name),
    );
  },

  staffInvite(
    school: { name: string },
    inviter: string,
    role: string,
    inviteUrl: string,
    opts: TemplateOptions = {},
  ) {
    return layout(
      { ...opts, schoolName: school.name },
      `You're invited to ${school.name}`,
      p(`<strong>${escapeHtml(inviter)}</strong> added you as <strong>${escapeHtml(role)}</strong> at <strong>${escapeHtml(school.name)}</strong>.`) +
        p("Click below to set your password and get started:") +
        button("Accept invite", inviteUrl),
      escapeHtml(school.name),
    );
  },

  parentInvite(
    school: { name: string },
    inviter: string,
    joinUrl: string,
    opts: TemplateOptions = {},
  ) {
    return layout(
      { ...opts, schoolName: school.name },
      `Follow your child at ${school.name}`,
      p(`<strong>${escapeHtml(inviter)}</strong> invited you to follow your child at <strong>${escapeHtml(school.name)}</strong>.`) +
        p("See grades, attendance, and school news — all in one place.") +
        button("Join now", joinUrl) +
        p(`<span style="color:${MUTED}">This link works for 14 days.</span>`),
      escapeHtml(school.name),
    );
  },

  applicationReceived(
    school: { name: string },
    learner: string,
    gradeLevel: string,
    reference: string,
    opts: TemplateOptions = {},
  ) {
    return layout(
      { ...opts, schoolName: school.name },
      "Application received",
      p(`<strong>${escapeHtml(school.name)}</strong> has received the enrolment application for <strong>${escapeHtml(learner)}</strong> (${escapeHtml(gradeLevel)}).`) +
        p("Your reference number:") +
        codeBlock(reference) +
        p("Keep this number. The registrar will review the application and contact you."),
      escapeHtml(school.name),
    );
  },

  applicationApproved(
    school: { name: string },
    student: { firstName: string; lastName: string; studentNumber: string; parentCode: string },
    section: string,
    reference: string,
    signupUrl: string,
    opts: TemplateOptions = {},
  ) {
    return layout(
      { ...opts, schoolName: school.name },
      "Enrolled!",
      p(`<strong>${escapeHtml(student.firstName)} ${escapeHtml(student.lastName)}</strong> is now enrolled in <strong>${escapeHtml(section)}</strong> at <strong>${escapeHtml(school.name)}</strong> (ref ${escapeHtml(reference)}).`) +
        p("To follow grades and attendance online, sign up as a parent:") +
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;width:100%">
          <tr><td style="padding:8px 0;font-size:14px;color:${MUTED};width:110px">Student ID</td><td style="padding:8px 0;font-size:15px;font-weight:600">${escapeHtml(student.studentNumber)}</td></tr>
          <tr><td style="padding:8px 0;font-size:14px;color:${MUTED};border-top:1px solid ${BORDER}">Parent code</td><td style="padding:8px 0;font-size:15px;font-weight:600;border-top:1px solid ${BORDER}">${escapeHtml(student.parentCode)}</td></tr>
        </table>` +
        button("Sign up as parent", signupUrl),
      escapeHtml(school.name),
    );
  },

  applicationDeclined(
    school: { name: string },
    learner: string,
    reference: string,
    reason: string,
    opts: TemplateOptions = {},
  ) {
    return layout(
      { ...opts, schoolName: school.name },
      "About your enrolment application",
      p(`The application for <strong>${escapeHtml(learner)}</strong> (ref ${escapeHtml(reference)}) at <strong>${escapeHtml(school.name)}</strong> was not approved.`) +
        `<div style="background:#fef2f2;border-left:3px solid #ef4444;padding:12px 16px;margin:16px 0;border-radius:0 6px 6px 0">
          <p style="margin:0;font-size:14px;color:#991b1b">${escapeHtml(reason)}</p>
        </div>` +
        p(`If you have questions, contact the school office directly.`),
      escapeHtml(school.name),
    );
  },

  invoice(
    school: { name: string },
    period: string,
    studentCount: number,
    totalPhp: string,
    dueDate: string,
    opts: TemplateOptions = {},
  ) {
    return layout(
      { ...opts, schoolName: school.name },
      `Invoice for ${period}`,
      p(`Here's the invoice for <strong>${escapeHtml(school.name)}</strong>.`) +
        `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:12px 0 16px;width:100%">
          <tr><td style="padding:8px 0;font-size:14px;color:${MUTED};width:130px">Period</td><td style="padding:8px 0;font-size:15px;font-weight:600">${escapeHtml(period)}</td></tr>
          <tr><td style="padding:8px 0;font-size:14px;color:${MUTED};border-top:1px solid ${BORDER}">Active students</td><td style="padding:8px 0;font-size:15px;font-weight:600;border-top:1px solid ${BORDER}">${studentCount}</td></tr>
          <tr><td style="padding:8px 0;font-size:14px;color:${MUTED};border-top:1px solid ${BORDER}">Total due</td><td style="padding:8px 0;font-size:18px;font-weight:700;border-top:1px solid ${BORDER}">&#8369;${escapeHtml(totalPhp)}</td></tr>
          <tr><td style="padding:8px 0;font-size:14px;color:${MUTED};border-top:1px solid ${BORDER}">Due by</td><td style="padding:8px 0;font-size:15px;font-weight:600;border-top:1px solid ${BORDER}">${escapeHtml(dueDate)}</td></tr>
        </table>`,
      escapeHtml(school.name),
    );
  },
};
