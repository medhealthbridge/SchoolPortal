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
- [Teachers and the class schedule](#teachers-and-the-class-schedule)
- [Teachers: inviting parents](#teachers-inviting-parents)
- [Teachers: learning materials](#teachers-learning-materials)
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

**On a phone**, the bar at the bottom holds the main screens. When there are
more than five, the last button is **More**, which lists every screen you can
reach.

Everyone signs in at `yourschool.<domain>/login` — staff, parents and
students at the same door.

If you only know the platform's address, open it and choose **Sign in** in the
top corner. Type your school's address — the first part of the web address your
school was given, like `stmary` — or paste the whole link, and you are taken to
your school's sign-in page.

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

Press **Forgot your password?** under the password box, and enter your email or
student ID. A link to set a new one arrives by email; it works once, for an
hour. Setting a new password signs out every phone and computer that was still
signed in with the old one.

No email address, or the school cannot send email yet? Ask the office:

| Whose password | Who makes the link |
| --- | --- |
| A teacher's | The registrar, the principal or the school admin (Teachers → Reset password) |
| A student's or a parent's | The registrar (Students → the student → Reset password) |
| Anyone else's | The school admin (People → Reset password) |

The office sees the link once, to give to the person in person or by text. It
works once, for three days. Nobody at the school ever sees or sets your password.

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
| 5. Add your students | The **registrar** adds them one by one or imports a spreadsheet, below | Students |
| 6. Add your teachers | Name and email; they get a link to set a password | Teachers |
| 7. Build the class schedule | Per section: subject, teacher, room, days and time, and the adviser | Schedule |
| 8. Invite the other offices | Principal, registrar, cashier and the rest: name, email, role | People |
| Optional: your profile | Address, phone, brand colour, logo — see below | Setup → School profile |

**Enrolment is per school year.** A student who transfers sections keeps last
year's record exactly as it was; nothing is rewritten.

### Student records belong to the registrar

Only the **registrar** adds, edits, withdraws, deletes and imports students.
The school admin can read the class list but cannot change a record, so give
the registrar role to whoever keeps your records (People → invite, or add the
role to yourself). Principals, teachers and the offices see a plain class list.

What the registrar can keep for each learner follows what DepEd asks for on
the enrolment form and shows on School Form 1:

| Group | Fields |
| --- | --- |
| Identity | Student number (your school's own), LRN (12 digits), first, middle and last name, suffix |
| Birth | Birth date, sex, place of birth, PSA birth certificate number |
| Placement | Section for this school year |
| Family | Guardian's name and phone, home address |
| Background | Mother tongue, religion, indigenous group, learner with a disability, 4Ps beneficiary |

Only the name and student number are required; the rest can be filled in later.
Religion, indigenous group, disability and 4Ps are **sensitive personal
information** under the Data Privacy Act. They appear only on the registrar's
screens and are never ticked in a download unless the registrar ticks them.

**Add a student** is a form at the top of **Students**. **Open a student** from
the list to edit any field, move them to another section, withdraw or delete.

- **Withdraw** keeps the record and everything attached to it. The student
  leaves rosters, invoices and announcements; **Show withdrawn** brings them
  back into view and **Restore** puts them back in their section.
- **Delete** is only for a record entered by mistake. A student who already has
  marks, grades, fees or discipline records cannot be deleted; withdraw them.
- A student number or LRN can belong to only one student in a school, and the
  form says who already has it.

### Importing a spreadsheet

Press **Download the spreadsheet template** on **Students**. It has every
column and one worked example row. Fill in one row per student and upload it.

```csv
student_number,first_name,last_name,lrn,birth_date,sex,section
ST-2026-0001,Althea,Alonzo,123456789012,2012-06-30,female,Grade 7 Sampaguita
```

- Required: `student_number`, `first_name`, `last_name`. Every other column is
  optional. Dates are `2012-06-30`; sex is `male` or `female`; `four_ps` is
  `yes` or `no`.
- `section` is the level and name together, as on the Setup page ("Grade 7
  Sampaguita"). Leave it empty and the student is added without a section; a
  section that does not exist is reported and those students are not placed.
- **Errors are shown before anything is saved.** A missing name, a bad LRN, a
  duplicate, a bad date: you get the line numbers and nothing is written.
- Importing the same file twice adds nobody; students already on file are left
  exactly as they were. It does not overwrite anyone's details.
- Every new student gets an activation code and a parent code. Print them from
  the **Students** page.
- Save an Excel sheet as **CSV UTF-8** before importing it.

### Downloads, templates and printing

Every module page that holds records ends with a **Download or print** card:

1. Tick the columns you need. A column you are not allowed to see is not
   offered.
2. Choose **Excel**, **PDF** or **CSV**.
3. Optionally pick a date range, or **Include withdrawn students**.
4. Tick **Blank template** for a file with only the headings, to fill in by
   hand or by spreadsheet.
5. Press **Download**.

| Page | What it downloads | Who |
| --- | --- | --- |
| Students | The class list and learner details | Registrar (full); others the plain columns |
| People | Staff and their roles | School admin |
| Attendance → Report | Every mark in a date range | Those who may see all attendance |
| Grades | Grades by period, section and subject | Those who may see all grades |
| Discipline | Incidents in a date range | Discipline officer |
| Fees | Fees charged and payments received | Accounting |
| Registrar | Requests and whether they were cleared | Registrar |
| SAO | Club members | SAO staff |
| Chaplain | Service hours | Chaplain |
| Audit log | Who changed what, in a date range | School admin, principal |

Guidance cases are not downloadable; that office keeps its records to itself.
CSV files use the column names as headings, so a downloaded student sheet can
be edited and imported again. Every download is written to the audit log.

### Starting the next school year

At the end of the year, after the last quarter is closed: Setup → School year
→ **Start the next school year**. The page shows, before anything changes,
what will happen to every learner:

- **Promoted**: general average 75 or more (or nothing graded). They move up a
  level with their section: Grade 7 Rizal becomes Grade 8 Rizal.
- **Kept at their level**: general average below 75. Each is listed with a
  choice, so a learner who passed remedial classes can be promoted instead.
- **Graduating**: passed Grade 12.

Name the new year and its dates, tick the box, and start it. Last year's
grades, attendance and records stay as they were. Incoming Grade 7 (or
Kinder) learners and their sections are added as usual, and the **schedule is
built again** in Schedule, since teachers and rooms change.

### Your school's profile and logo

**Setup → School profile.** Only the school admin sees it; the registrar can
build the timetable but cannot rename the school.

| Field | What it does |
| --- | --- |
| School name | Shown in the corner of every screen, on the sign-in page, and on invoices |
| Phone | Optional. Shown on report cards |
| Address | Optional, one line as you would put it on a letter. Shown on report cards |
| Brand colour | Colours the badge in the corner and on the sign-in page |

Pick the colour from the box; the badge beside it shows exactly what you will
get. **The letters on it switch between light and dark on their own**, so a
pale yellow still reads. Colour is deliberately kept to the badge — the rest of
the interface stays neutral so the attendance marks are the only colour on a
page.

Every change is recorded in the audit log with before and after. **Your
address on the internet, `yourschool.<domain>`, cannot be changed here.** Every
link the school has ever sent points at it; ask the platform admin if it truly
must change.

**Logo.** Optional when you register (the last step before you pick a tier
asks for it) and changeable any time under **Setup → Logo**. A PNG, JPEG or
WebP up to 2 MB; square reads best. It replaces your initials in the corner of
every screen and appears on your school's sign-in page. SVG is refused on purpose — it is
a file that can carry code, and a logo is not worth the risk.

### Switching modules on and off

**Modules** shows what your plan includes and what each one does. Switching one
off hides its screens and keeps every record it holds; switch it back on and
everything is as it was. The page also lists, in plain words, what each module
tells the others.

---

## Teachers and the class schedule

The **registrar**, the **principal** and the **school admin** add teachers and
build the schedule. When a teacher signs in, their week is already there; when a
parent or student signs in, so is the child's.

**Teachers → Add a teacher.** Name, email, and whether they also advise a
section. The email fills itself in from the name and your school's address
(maria.delacruz@yourschool…); put the teacher's own email instead if you want
the invite emailed to them. Until email is set up, copy their link from
**Waiting to join** and send it by text or chat. They open it and choose a
password.

The list shows each teacher's advisory section, classes a week and subjects.
**Turn off** a teacher who leaves: they are signed out at once and can no longer
sign in; their marks and grades stay. **Turn back on** reverses it. Office
accounts (admin, registrar, principal) are changed on **People**, by the school
admin only.

**Schedule.** Pick a section. Then:

- **Adviser.** Choose the teacher who advises it. They can then see the whole
  section's attendance and grades.
- **Add a class.** Subject, teacher, room (optional), start and end time, and
  tick every day it meets. A Monday–Wednesday–Friday class is one entry.
- **Clashes are refused.** If the teacher is teaching elsewhere, the section
  already has a class, or the room is booked at that time, nothing is saved and
  the page says exactly what it clashes with.
- **Change** moves a class to another time, teacher or room, with the same
  checks. **Remove** takes it off. A class that already has attendance is
  retired instead of deleted, so its marks stay in the records.
- **Download or print** the whole schedule as Excel or PDF at the bottom.

**Who sees what.** A teacher's **Schedule** shows their week, and **My classes**
lists their sections. A parent sees each child's week on the child's page; a
student sees their own.

## Teachers: inviting parents

**My classes → a section → Invite a parent** under a student. Enter the parent's
name, relationship, email (how they will sign in) and, if you have it, a mobile
number. The link comes back on screen: **Copy link**, or **Text it** to open
your phone's messages with it filled in. It is also emailed and texted when the
school has a provider. A link works once and lasts 14 days.

- A teacher can invite parents only for students in their own classes. The
  registrar can invite for anyone, from the student's record.
- **Siblings:** invite the same email for each child. The parent's second link
  asks for the password they already chose, and the child joins the same
  account. Nobody can use a link to get into someone else's account.
- The registrar sees every parent linked to a student, and can **Unlink** one.

**Announcements.** A teacher can post to the sections they teach or advise. The
office can post to the whole school. A parent sees what went to the whole school
and to their own children's sections, and nothing aimed at other classes.

## Teachers: learning materials

**Learning materials → Share a module.** Pick the section and subject, give it a
title students will recognise ("Quarter 1, Module 3: Fractions"), add a note if
you like, and choose the file: PowerPoint, Word, Excel, PDF or a picture.

- **Large slide decks are made smaller first.** The pictures inside a PowerPoint
  or Word file are shrunk before it uploads (photos pasted onto slides are
  usually far bigger than they are shown). The page says how much smaller it
  got. Video inside a deck is left as it is.
- Files up to 100 MB after that. A larger deck: split it into parts.
- A teacher shares with the sections and subjects they teach; the adviser with
  any subject of their section; the office with any section.
- **Remove** takes a module down; the person who shared it and the office can.

**Students and parents** see every module shared with their section, by subject.
**View** opens a PowerPoint, Word or Excel file in the browser, so a phone
without PowerPoint can read it; **Download** saves it. Only people in that
section can open them.

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

### SF2: the daily attendance sheet

Attendance → Report → **SF2 daily sheet**, or **SF2 daily attendance** on your
class list. One row per learner, one column per school day of the month, with
the month's absences and tardies, and how many were present each day.
Download it as **Excel** or **PDF** to print and sign.

A day is read from all of that learner's class marks: **A** only if absent
from every class, **L** if late to any, **P** otherwise, **E** if excused, and
blank if no class was marked. Advisers and teachers see their own sections;
the office sees every section.

### The monthly report

**Report** shows present, absent, late and excused per student for a month,
with a section filter. **Export this month** downloads exactly what is on the
screen as a CSV:

```csv
Student number,Name,Present,Absent,Late,Excused
```

---

## Teachers: entering grades

Grades follow DepEd Order 8, s. 2015. Open **Grades**, pick your class, and you
land on its **class record** for the current quarter.

1. **Add each quiz, task or exam** as you give it: Written Work, Performance
   Task or Quarterly Assessment, a name, and the highest possible score.
2. **Enter scores**: open it and type each learner's raw score. A box left
   empty counts as 0 in the record, as on paper; a score above the highest
   possible is refused.
3. The **Quarterly grades** table works out each learner's percentage per
   component, weights it, sums the initial grade and transmutes it with the
   DepEd table (an initial 60 becomes 75). A learner shows no quarterly grade
   until all three components have something in them.
4. **Post grades to report cards** copies each quarterly grade onto the report
   card. Post again after any change.

**How a subject is weighted** is set once by the school office on the same
page: Languages, AP and EsP 30/50/20; Science and Math 40/40/20; MAPEH and
EPP/TLE 20/60/20; and the senior high groups. A new subject gets a sensible
guess from its name.

Prefer to compute grades elsewhere? **Enter grades directly** on the same page
takes a quarterly grade out of 100 per learner, as before.

**75 is the passing mark.** A grade below it is counted on the "Below 75" tile
and, if Guidance is switched on, that office is told — the subject and the
student, so somebody follows up.

Only the teacher on the timetable for that class (and the school office) can
open or change its record.

### Grading periods (school admin)

Grades → Grading periods. Add each quarter with its dates and its order.

**Closing a period freezes its scores** and tells the portal the report card is
ready; every guardian is notified. You can reopen a period if you closed it
early.

### The report card (SF9)

Grades → a student's card. Learning areas down the side, quarters across, the
final grade with Passed or Failed, and the general average with its DepEd
descriptor (Outstanding 90–100 down to Did Not Meet Expectations below 75). If
Attendance is on, attendance totals appear on it; if SAO or the chaplain have
logged service hours, those appear too.

**Download SF9 (PDF)** prints the Learner's Progress Report Card with the LRN,
grade and section, school year, descriptor legend, attendance, and lines for
the adviser, school head and parent to sign. Parents can download their own
child's.

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

**Joining.** Open the link your child's teacher sent, choose a password, and you
are in. A second child: open their link and sign in with the same password, or
go to **My children → Add another child** with the student ID and parent code
the school printed.

| You see | Where |
| --- | --- |
| Each child's attendance today and recently | Today, one card per child |
| The section, the adviser and today's classes | Today |
| The weekly class schedule, with teachers and rooms | Your child's page |
| Grades and the report card, once the period is closed | Your child's page |
| News for the whole school and for the child's class | Your child's page, and Notices |
| The balance owing, and what it is for | Your child's page |
| Alerts | Sent to you |

Discipline and guidance records are not shown to parents; those offices
contact families directly.

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
| Principal | Dashboards, all academic data, teachers and the class schedule |
| Registrar | The only role that adds, edits, withdraws, deletes and imports students; also teachers, the class schedule, sections and clearance |
| Teacher | Own classes: attendance, grades, incident reports, inviting parents, posting to their sections |
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
