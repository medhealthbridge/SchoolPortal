/**
 * QA: who may open what, checked on the server, for every role; and that no
 * one reaches another school's or another family's records by ID, URL,
 * search, export or file link.
 *
 * The expected access below is written from the role descriptions in the
 * manual ("What each role may do"), not read from the code, so a change to
 * the code that widens access fails here.
 *
 *   npm run db:seed && npm run build && npx next start
 *   node scripts/qa-access.mjs
 */
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const base = (sub) => `http://${sub}.lvh.me:3000`;
const dbUrl = readFileSync(".env.local", "utf8").match(/^DATABASE_URL=(.*)$/m)[1];
const sql = (q) => execSync(`psql "${dbUrl}" -Atc "${q.replace(/"/g, '\\"')}"`).toString().trim();
const mint = (sub, email) => execSync(`npx tsx scripts/make-session.ts ${sub} ${email}`).toString().trim();

const results = [];
const check = (id, ok, what, evidence = "") => {
  results.push({ id, ok, what, evidence });
  if (!ok) console.log(`FAIL ${id} ${what} ${evidence}`);
};
async function get(sub, path, sid) {
  const res = await fetch(`${base(sub)}${path}`, {
    redirect: "manual",
    headers: sid ? { cookie: `sp_session=${sid}` } : {},
  });
  const body = res.status === 200 ? await res.text() : "";
  return { status: res.status, location: res.headers.get("location") ?? "", body };
}

/* ---------------- fixtures: two active schools, a student account ---------------- */
sql("update schools set status = 'active' where subdomain in ('stmary','northgate')");
const stmary = sql("select id from schools where subdomain='stmary'");
const studentEmail = "qa.student@stmary.databridgesol.space";
let studentRow = sql(
  `select s.id from students s join users u on u.id = s.claimed_by_user_id where u.email='${studentEmail}'`,
);
if (!studentRow) {
  studentRow = sql(
    `select s.id from students s where s.school_id='${stmary}' and s.claimed_by_user_id is null order by s.student_number limit 1`,
  );
  const uid = sql(
    `insert into users (school_id, email, name, password_hash, status, privacy_consent_version, privacy_consent_at) values ('${stmary}', '${studentEmail}', 'QA Student', 'x', 'active', 1, now()) returning id`,
  ).split("\n")[0];
  sql(`insert into user_roles (school_id, user_id, role) values ('${stmary}', '${uid}', 'student')`);
  sql(`update students set claimed_by_user_id='${uid}', claimed_at=now() where id='${studentRow}'`);
}

const ROLES = {
  admin: "admin@stmary.databridgesol.space",
  principal: "principal@stmary.databridgesol.space",
  registrar: "registrar@stmary.databridgesol.space",
  teacher: "teacher@stmary.databridgesol.space", // teacher and adviser of a section
  discipline: "discipline@stmary.databridgesol.space",
  guidance: "guidance@stmary.databridgesol.space",
  sao: "sao@stmary.databridgesol.space",
  chaplain: "chaplain@stmary.databridgesol.space",
  cashier: "cashier@stmary.databridgesol.space",
  parent: "parent@stmary.databridgesol.space",
  student: studentEmail,
};
const sid = {};
for (const [role, email] of Object.entries(ROLES)) sid[role] = mint("stmary", email);
const everyone = Object.keys(ROLES);

/* ---------------- T-100: role × page, from the manual ---------------- */
const PAGES = {
  "/": everyone,
  "/me": everyone.filter((r) => r !== "student"), // a student's Me is their own record: checked below
  "/schedule": everyone,
  "/materials": everyone,
  "/announcements": everyone,
  "/grades": ["admin", "principal", "registrar", "teacher"], // families read cards from the child page
  "/attendance": ["teacher"],
  "/classes": ["teacher"],
  "/attendance/report": ["admin", "principal", "teacher", "discipline"],
  "/analytics": ["admin", "principal"],
  "/audit": ["admin", "principal"],
  "/billing": ["admin", "cashier"],
  "/fees": ["admin", "cashier"],
  "/modules": ["admin"],
  "/people": ["admin"],
  "/registrar": ["admin", "registrar"],
  "/setup": ["admin", "principal", "registrar"],
  "/setup/new-year": ["admin", "principal", "registrar"],
  "/teachers": ["admin", "principal", "registrar"],
  "/students": ["admin", "principal", "registrar", "teacher", "discipline", "guidance", "sao", "chaplain", "cashier"],
  "/students/template": ["registrar"],
  "/enrolments": ["registrar"],
  "/discipline": ["teacher", "discipline"],
  "/guidance": ["guidance"],
  "/sao": ["sao"],
  "/chaplain": ["chaplain"],
};
for (const [path, allowed] of Object.entries(PAGES)) {
  for (const role of everyone) {
    if (path === "/me" && role === "student") continue;
    const r = await get("stmary", path, sid[role]);
    const want = allowed.includes(role) ? 200 : 404;
    check("T-100", r.status === want, `${role} ${path} → ${want}`, `got ${r.status} ${r.location}`);
  }
}

const studentMe = await get("stmary", "/me", sid.student);
check("T-100", studentMe.status === 307 && studentMe.location.endsWith(`/child/${studentRow}`), "a student's Me opens their own record", `got ${studentMe.status} ${studentMe.location}`);

/* ---------------- T-101: role × export, including restricted columns ---------------- */
const EXPORTS = {
  students: ["admin", "principal", "registrar", "teacher", "discipline", "guidance", "sao", "chaplain", "cashier"],
  staff: ["admin"],
  teachers: ["admin", "principal", "registrar"],
  schedule: ["admin", "principal", "registrar"],
  attendance: ["admin", "principal", "teacher", "discipline"],
  grades: ["admin", "principal", "registrar", "teacher"],
  incidents: ["discipline"],
  charges: ["admin", "cashier"],
  payments: ["admin", "cashier"],
  "registrar-requests": ["admin", "registrar"],
  "club-members": ["sao"],
  "service-hours": ["chaplain"],
  audit: ["admin", "principal"],
};
for (const [key, allowed] of Object.entries(EXPORTS)) {
  for (const role of everyone) {
    const r = await get("stmary", `/export/${key}?format=csv`, sid[role]);
    const want = allowed.includes(role) ? 200 : 404;
    check("T-101", r.status === want, `${role} export ${key} → ${want}`, `got ${r.status}`);
  }
}
// The LRN and guardian phone are the registrar's; a teacher's export leaves them out even when asked.
const teacherCsv = (await get("stmary", "/export/students?format=csv&cols=lrn&cols=guardian_phone&cols=last_name", sid.teacher)).body;
check("T-101", !/LRN|Guardian/i.test(teacherCsv.split("\n")[0] ?? ""), "teacher export drops restricted columns", teacherCsv.split("\n")[0]);

/* ---------------- T-102: API routes answer 401/403, not data ---------------- */
for (const [path, allowed] of Object.entries({ "/api/attendance/today": ["teacher"], "/api/attendance/report.csv": ["admin", "principal", "teacher", "discipline"] })) {
  for (const role of everyone) {
    const r = await get("stmary", path, sid[role]);
    const ok = allowed.includes(role) ? r.status === 200 : r.status === 403 || r.status === 404;
    check("T-102", ok, `${role} ${path}`, `got ${r.status}`);
  }
}
check("T-102", (await get("stmary", "/api/attendance/today")).status === 401, "signed out API → 401");

/* ---------------- T-200: tenant isolation by ID, URL, search, export, files ---------------- */
const ng = sql("select id from schools where subdomain='northgate'");
const ngStudent = sql(`select id from students where school_id='${ng}' limit 1`);
const ngNumber = sql(`select student_number from students where id='${ngStudent}'`);
const ngName = sql(`select last_name || ', ' || first_name from students where id='${ngStudent}'`);
const ngSection = sql(`select id from sections where school_id='${ng}' limit 1`);
const ngSubject = sql(`select id from subjects where school_id='${ng}' limit 1`);
const ngSlot = sql(`select id from timetable_slots where school_id='${ng}' limit 1`);
const byId = [
  `/students/${ngStudent}`,
  `/child/${ngStudent}`,
  `/grades/card/${ngStudent}`,
  `/grades/card/${ngStudent}/sf9`,
  `/classes/${ngSection}`,
  `/grades/${ngSection}/${ngSubject}`,
  `/attendance/${ngSlot}`,
  `/attendance/sf2/download?section=${ngSection}&format=xlsx`,
  `/api/attendance/class/${ngSlot}`,
];
for (const role of ["admin", "registrar", "teacher", "parent"]) {
  for (const path of byId) {
    const r = await get("stmary", path, sid[role]);
    // Refused: a 404, or (for a page that has started streaming) the not-found
    // screen; either way none of Northgate's learners appear.
    const refused = r.status === 404 || r.status === 403 || r.body.includes("could not be found");
    check("T-200", refused && !r.body.includes(ngNumber) && !r.body.includes(ngName), `${role} at St. Mary cannot open Northgate's ${path.split("?")[0]}`, `got ${r.status}`);
  }
}
for (const role of ["admin", "registrar"]) {
  const search = await get("stmary", `/students?q=${encodeURIComponent(ngNumber)}`, sid[role]);
  check("T-201", search.body.includes("0 match") && !search.body.includes(ngName), `${role} search does not find Northgate's student`);
  const csv = await get("stmary", "/export/students?format=csv", sid[role]);
  check("T-201", csv.status === 200 && !csv.body.includes(ngNumber), `${role} export holds no Northgate rows`);
}
// A St. Mary cookie on Northgate's address is not a Northgate session.
const cross = await get("northgate", "/students", sid.admin);
check("T-202", cross.status === 307 || cross.status === 302 || cross.status === 303, "St. Mary's session is refused at Northgate", `got ${cross.status} ${cross.location}`);
// Logos are public by design (they show on the sign-in page), so the file
// that must stay inside its school is a learning material.
const ngTeacher = sql(`select id from users where email='teacher@northgate.databridgesol.space'`);
const ngMaterial = sql(
  `insert into learning_materials (school_id, section_id, subject_id, title, file_url, file_name, content_type, size_bytes, original_bytes, uploaded_by_user_id) values ('${ng}', '${ngSection}', '${ngSubject}', 'QA secret module', 'https://example.test/qa.pdf', 'qa.pdf', 'application/pdf', 10, 10, '${ngTeacher}') returning id`,
).split("\n")[0];
for (const role of ["admin", "teacher", "parent"]) {
  const r = await get("stmary", `/materials/open/${ngMaterial}`, sid[role]);
  check("T-203", r.status === 404 && !(r.location ?? "").includes("example.test"), `${role} at St. Mary cannot open Northgate's material`, `got ${r.status} ${r.location}`);
  const list = await get("stmary", "/materials", sid[role]);
  check("T-203", !list.body.includes("QA secret module"), `${role} does not see Northgate's material listed`);
}
sql(`delete from learning_materials where id='${ngMaterial}'`);

/* ---------------- T-210: one family cannot see another's child ---------------- */
const parentKids = sql(
  `select sg.student_id from student_guardians sg join users u on u.id=sg.guardian_user_id where u.email='parent@stmary.databridgesol.space'`,
).split("\n");
const stranger = sql(
  `select id from students where school_id='${stmary}' and id not in (${parentKids.map((k) => `'${k}'`).join(",")}) and id <> '${studentRow}' limit 1`,
);
for (const path of [`/child/${stranger}`, `/grades/card/${stranger}`, `/grades/card/${stranger}/sf9`]) {
  for (const role of ["parent", "student"]) {
    const r = await get("stmary", path, sid[role]);
    check("T-210", r.status === 404, `${role} cannot open another child's ${path.split("/").slice(1, 3).join("/")}`, `got ${r.status}`);
  }
}
const own = await get("stmary", `/grades/card/${parentKids[0]}`, sid.parent);
check("T-210", own.status === 200, "a parent opens their own child's card", `got ${own.status}`);
const mine = await get("stmary", `/grades/card/${studentRow}`, sid.student);
check("T-210", mine.status === 200, "a student opens their own card", `got ${mine.status}`);

/* ---------------- T-300: signed out and suspended ---------------- */
for (const path of ["/", "/students", "/grades", `/grades/card/${parentKids[0]}/sf9`, "/export/students?format=csv"]) {
  const r = await get("stmary", path);
  check("T-300", r.status >= 300 && r.status < 400 && r.location.includes("/login"), `signed out ${path} → login`, `got ${r.status} ${r.location}`);
}
sql("update schools set status = 'suspended' where subdomain='northgate'");
const ngAdmin = mint("northgate", "admin@northgate.databridgesol.space");
const held = await get("northgate", "/students", ngAdmin);
check("T-301", held.status >= 300 && held.status < 400 && held.location.includes("/on-hold"), "a suspended school's staff are sent to On hold", `got ${held.status} ${held.location}`);
const keptRows = sql(`select count(*) from students where school_id='${ng}'`);
check("T-301", Number(keptRows) > 0, "suspension keeps the school's data");

const failed = results.filter((r) => r.ok === false);
const skipped = results.filter((r) => r.ok === null);
const byId2 = {};
for (const r of results) {
  byId2[r.id] ??= { pass: 0, fail: 0 };
  if (r.ok === true) byId2[r.id].pass++;
  if (r.ok === false) byId2[r.id].fail++;
}
console.log("\n" + Object.entries(byId2).map(([k, v]) => `${k}: ${v.pass} pass, ${v.fail} fail`).join("\n"));
for (const s of skipped) console.log(`NOT TESTED ${s.id} ${s.what}`);
console.log(failed.length === 0 ? "\nall checks passed" : `\n${failed.length} check(s) failed`);
process.exit(failed.length === 0 ? 0 : 1);
