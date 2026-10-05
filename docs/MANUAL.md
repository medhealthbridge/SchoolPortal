# SchoolPortal: the manual

For the people who use it — the school admin, teachers, each office, and
parents and students. No technical knowledge assumed. If you run the servers
instead, read [OPERATIONS.md](OPERATIONS.md).

Your school has its own address, `yourschool.<the platform's domain>`. Only
your school's records exist at that address; nobody at another school can see
them, and you cannot see theirs.

---

## Contents

- [Getting in](#getting-in)
- [First week: the school admin's setup](#first-week-the-school-admins-setup)
- [Teachers: taking attendance](#teachers-taking-attendance)
- [Teachers: entering grades](#teachers-entering-grades)
- [Discipline office](#discipline-office)
- [Guidance office](#guidance-office)
- [Student affairs and the chaplain](#student-affairs-and-the-chaplain)
- [Registrar](#registrar)
- [Cashier and accounting](#cashier-and-accounting)
- [Principal: the dashboards](#principal-the-dashboards)
- [Parents and students](#parents-and-students)
- [What each role may do](#what-each-role-may-do)
- [What happens by itself](#what-happens-by-itself)
- [When something goes wrong](#when-something-goes-wrong)

---

## Getting in

Everyone signs in at `yourschool.<domain>/login` — staff, parents and
students at the same door.

| You are | You sign in with |
| --- | --- |
| Staff | The email the school admin invited, and your password |
| Student | Your student ID **or** your email, and your password |
| Parent | Your email and your password |

**Staff accounts are invite-only.** There is no public sign-up for staff: the
school admin invites you by email and you set your own password from the link.

**Students and parents claim their own.** The school prints a slip for each
student with two codes on it — an activation code for the student and a
separate parent code. Go to `yourschool.<domain>/signup`, choose "I am a
student" or "I am a parent", and enter the student ID with the matching code.

A code works once. Once a student has claimed their record, nobody else can
claim it. **The codes are printed and handed out on paper, never emailed**, and
they are not the student's birthdate — classmates know that.

### If you forget your password

Ask the school admin. They can re-invite you, which lets you set a new one.

### Too many tries

After about ten wrong attempts the door closes for a few minutes and tells you
when to come back. Wait it out; nothing is broken and nothing is locked
permanently.

---

## First week: the school admin's setup

Open **Setup**. The checklist at the top is the whole job, in order, and it
ticks itself off as you go. Teachers cannot take attendance until it is done.

| Step | What to do | Where |
| --- | --- | --- |
| 1. Verify the owner's email | Done during registration | — |
| 2. Set the school year | Name it as your school does ("2026–2027"), with its start and end dates | Setup → School year |
| 3. Add your sections | A level and a name: "Grade 7", "Sampaguita" | Setup → Sections |
| 4. Add subjects and rooms | A subject has a code and a name. A room has a grid — rows and columns — which becomes the seat plan | Setup → Subjects, Rooms |
| 5. Import your students | A CSV file, below | Setup → Import students |
| 6. Build the timetable | Teacher, subject, section, room, day, start and end time. One row per class per day | Setup → Timetable |
| 7. Invite your staff | Name, email, role | People |

**Enrolment is per school year.** A student who transfers sections keeps last
year's record exactly as it was; nothing is rewritten.

### The student CSV

Three columns are required and one is optional:

```csv
student_number,first_name,last_name,section
ST-2026-0001,Althea,Alonzo,Sampaguita
ST-2026-0002,Bea,Hernandez,Sampaguita
```

- `section` matches a section you already added, by name. Leave it out and the
  student is imported without being enrolled in one.
- **Errors are shown before anything is saved.** A missing name, a duplicate
  student number, a bad line — you get the line numbers and nothing is
  written. Fix the file and import again.
- Importing the same file twice does not duplicate anyone; a student number
  already on file is skipped.
- Every imported student gets an activation code and a parent code. Print
  them from the **Students** page.

### Your logo

Setup → Logo. A PNG, JPEG or WebP up to 2 MB; square reads best. It replaces
your initials in the corner of every screen. SVG is refused on purpose — it is
a file that can carry code, and a logo is not worth the risk.

### Switching modules on and off

**Modules** shows what your plan includes and what each one does. Switching one
off hides its screens and keeps every record it holds; switch it back on and
everything is as it was. The page also lists, in plain words, what each module
tells the others.

---

## Teachers: taking attendance

This is built for a phone, walking around the room, with no signal.

1. Open **Classes**. Your classes for today are listed in order, with the next
   one marked.
2. Tap a class. You get the seat plan for that room — the grid the school
   admin set up — with a chip per student.
3. **Tap a seat to change the mark.** It cycles Present → Absent → Late →
   Excused. Every mark shows its letter as well as its colour, so you are
   never guessing at a shade.
4. **Mark all present** does the common case in one tap; then change the few
   exceptions.
5. Tap **Submit attendance**.

Each mark is a colour *and* a letter:

| Mark | Letter | Means |
| --- | --- | --- |
| Present | P | In class |
| Absent | A | Not in class, no excuse given |
| Late | L | Arrived after the bell |
| Excused | E | Absent with a reason the school accepts |

### With no signal

Keep working. The screen says **"Held on this device"** and the marks sit on
your phone. When signal returns they go up by themselves and the count drops
to zero. You can close the browser, lock the phone, or walk out of range mid
class — nothing is lost.

If two people mark the same student in the same class on the same day, the
later mark wins, and the earlier one stays in the audit log.

### The monthly report

**Report** shows present, absent, late and excused per student for a month,
with a section filter. **Export this month** downloads exactly what is on the
screen as a CSV:

```csv
Student number,Name,Present,Absent,Late,Excused
```

---

## Teachers: entering grades

1. Open **Grades**. The current grading period is named at the top.
2. Pick your class.
3. Type a score out of 100 for each student. Leave a box empty if there is no
   score yet — a blank is not a zero and is left out of the average.
4. Save.

**75 is the passing mark.** A score below it is counted on the "Below 75" tile
and, if Guidance is switched on, that office is told — the subject and the
student, so somebody follows up.

### Grading periods (school admin)

Grades → Grading periods. Add each quarter with its dates and its order.

**Closing a period freezes its scores** and tells the portal the report card is
ready; every guardian is notified. You can reopen a period if you closed it
early.

### The report card

Grades → a student's card. Subjects down the side, periods across, with
averages. If Attendance is on, their attendance totals appear on it; if SAO or
the chaplain have logged service hours, those appear too.

---

## Discipline office

**Report an incident** — anyone who teaches can file one; the office handles it.
Student ID, the date, the offence level and what happened.

**Offence levels** are yours to define: a name, a severity (minor, major,
grave) and a description. Define them before the first report.

**Issue a sanction** — pick the incident, the kind of sanction, the dates and a
note. Issuing a sanction marks the incident resolved.

> A **suspension** tells Attendance to mark those school days **excused**, not
> absent, for every day it covers. The teacher does not have to remember, and
> the student is not marked truant for a punishment the school imposed.

A second case for the same student opens a guidance case automatically, if
Guidance is on.

Late marks arrive here on their own: Attendance sends every late arrival to
this office, counted against your offence levels.

---

## Guidance office

**These records are confidential.** Only this office reaches them. Every
opening of the page, and every note, is written to the audit log with your name
on it — by design, and visible to the school admin.

- **Open a case** — student ID, what it is about, and where it came from
  (walk-in, teacher referral, parent request, attendance flag, discipline
  referral). Opening the same case twice for the same student does nothing; you
  keep the one you have.
- **Add a note** — notes stay inside this office.
- **Schedule an appointment** — a case, a date and a time.
- **Close** a case when it is finished.

Cases also arrive by themselves: three absences in a row, a failing grade, or a
second discipline case each open one, titled so you know why.

---

## Student affairs and the chaplain

The two offices use the same screen; SAO calls them events, the chaplain calls
them activities.

- **Add an event** — a name, a date, where, and the service hours it earns
  (0 if none).
- **Credit a section** — everyone enrolled in that section gets the hours.
  Crediting the same section twice does nothing, so you cannot double-count.
- **Clubs** (SAO only) — add a club, then add members by pasting student IDs
  separated by spaces or commas. If one ID is wrong, nothing is saved and it
  tells you which.

Hours credited here are printed on the report card when Grades is on.

---

## Registrar

**File a request** — a student ID, what it is for (transcript, certificate,
transfer, enrolment) and the purpose.

**Clearance is checked the moment it is filed.** The registrar asks the other
offices that are switched on: does this student owe the cashier? Is there an
open discipline case? The request comes back **cleared** or **on hold**, and if
it is on hold the reason says so in words — "₱10,980 still owing to the
cashier."

The check reports which offices it asked, so an empty answer is never mistaken
for a clean one.

**Re-check** after the student settles up — or do nothing: paying at the
cashier lifts the hold by itself.

**Release** hands the document over and closes the request.

---

## Cashier and accounting

**Fees for this year** — add a fee with a name, an amount and a due date. Leave
the level blank to charge every level. Saving a fee that already exists updates
it rather than making a second one.

**Charge everyone** applies a fee to every enrolled student at that level.

**Record a payment** — student ID, amount in pesos, receipt number and how they
paid. Clearing a balance **lifts the registrar's hold at once**, and the
guardian is told.

**Who owes** lists the biggest balance first. A student is charged
automatically when they are enrolled.

---

## Principal: the dashboards

**Analytics** draws on whichever modules are switched on — attendance rate, the
average mark, how many are below 75, open incidents, the guidance caseload,
fees outstanding, clearance holds and service hours. It reads what the other
modules report and holds no records of its own.

**Today** is the live view: marks so far, which classes have submitted, and the
exceptions.

---

## Parents and students

**A parent sees their own children. A student sees their own record.** Nothing
else, ever — this is checked on the server, not merely hidden from the menu.

| You see | Where |
| --- | --- |
| Attendance, day by day | Your child's page / My records |
| Grades and the report card, once the period is closed | same |
| The balance owing, and what it is for | same |
| Announcements from the school | Notices |
| Alerts | Sent to you |

You are told when your child is marked absent — by SMS and in the portal, once
per day rather than once per class. You are told when a report card is ready,
and when a balance changes.

---

## What each role may do

Every one of these is checked on the server for every request. Hiding a menu
item is not security; this is.

| Role | Reaches |
| --- | --- |
| School admin (owner) | One school: setup, users, modules, subscription |
| Principal | Dashboards, approvals, all academic data |
| Registrar | Student records, enrolment, sections |
| Teacher | Own classes: attendance, grades, incident reports |
| Adviser | Teacher rights plus the whole advisory section |
| Discipline officer | Discipline cases and sanctions |
| Guidance counselor | Confidential cases |
| SAO staff | Clubs, events, student IDs |
| Chaplain | Ministry activities and service hours |
| Accounting | Fees, payments, receipts |
| Parent | Own children only, read-only |
| Student | Own record only, read-only |

A person can hold more than one role. The school admin assigns them on the
**People** page.

---

## What happens by itself

No office has to tell another. These are automatic, and each one only runs
while both modules are switched on.

| When this happens | This follows |
| --- | --- |
| A student is marked absent | The guardian gets an SMS and a portal notification |
| Three absences in a row | Guidance opens a case, titled with the streak |
| A student is marked late | Discipline records it against your offence levels |
| A suspension starts | Attendance is written excused for each school day of it |
| A second case on one student | Guidance opens a case |
| A grading period closes | Every guardian is told the card is ready |
| A failing score is entered | Guidance is told, with the subject |
| A student is enrolled | Your standing fees are charged to them |
| A balance changes | The registrar re-checks its holds; the guardian is told |

---

## When something goes wrong

**"Account on hold"** — the school's invoice is unpaid. Nothing has been
deleted and every record is exactly as it was left. The school admin can still
open Billing to settle it, and everything returns the moment the payment is
recorded. Attendance already taken on a teacher's phone stays on the phone and
goes up once the school is back.

**A page says "not found" that you expected to see** — either your role does not
reach it, or the module is switched off for your school. Ask the school admin;
both are on the **Modules** and **People** pages.

**Marks are stuck on a phone** — they are safe. They go up on the next
connection. Do not clear the browser's data for the site, which is where they
are kept.

**A parent is not getting alerts** — check that the guardian is linked to the
student and that the mobile number is right, on the student's record. The
school admin can see everything the system has sent on the Outbox.

**Something looks wrong in the records** — the **Audit log** holds every change
and every sensitive view, newest first, and nothing in it is ever edited or
removed.
