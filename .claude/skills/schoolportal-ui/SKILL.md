---
name: schoolportal-ui
description: The SchoolPortal interface system — tokens, components, layout and copy rules for every screen in this app. Load before writing or changing ANY page, layout, component or style under src/app or src/components, before adding a screen, and before touching globals.css or the Tailwind theme. Triggers on anything visual in this repo: a new page or route, restyling an existing one, a form, a table, a dashboard number, an attendance mark, a button, an empty state, an error message, "make it look right", "match the design", "add a screen", "responsive", "mobile".
---

# SchoolPortal UI

One system for every screen: the public site, each school's app, and the
platform admin. It comes from the design canvas for this product — a quiet,
neutral product surface where the data is the only colour on the page.

Read `reference/tokens.md` before writing styles and
`reference/components.md` before building anything that is not a one-off.
Both are short.

## The idea in one line

Neutral greys, white cards on a near-white ground, one near-black for every
primary action, and colour reserved for the four attendance marks.

If a screen looks colourful, something is wrong. The only saturated things on
a page should be the marks a teacher made.

## Non-negotiables

1. **Use the tokens.** Never write a raw hex in a component. Every colour,
   radius, shadow and height is a CSS variable from `src/app/globals.css`, and
   the Tailwind theme exposes them (`bg-surface`, `text-muted`,
   `border-line`). A new hex means the system is missing something: add it to
   the tokens and to `reference/tokens.md`, then use it.
2. **44px is the floor** for anything a finger touches: buttons, nav items,
   inputs, icon buttons, segment buttons. The primary action at the bottom of
   a phone screen is 48px. Teachers use this walking around a classroom.
3. **Real elements.** `<button>`, `<a href>`, `<input>` with a `<label>`,
   `<th scope>`. Never a click handler on a div. Icon-only buttons carry
   `aria-label`.
4. **A mark is never colour alone.** Every attendance status shows its letter
   (P, A, L, E) or its word beside the colour. Use `StatusBadge`, `SeatChip`
   or `SegmentedStatus` and you get this for free.
5. **Numbers are tabular.** Anything a reader compares down a column gets
   `tabular-nums` (`font-variant-numeric` is set on `body`, so this is only a
   concern if you override it).
6. **Light only.** The system has no dark mode. Do not add
   `prefers-color-scheme` blocks or `dark:` variants.
7. **Phone first, then desktop.** Every screen is checked at 320px. Run
   `npm run responsive` — it fails on any horizontal page scroll.

## Layout

Two shells, both already built. Use them; do not invent a third.

- **School app** (`src/app/s/(app)/layout.tsx`) and **platform admin**
  (`src/app/admin/(dash)/layout.tsx`): a 240px sidebar from `lg` up, a 56px
  header carrying a breadcrumb and the page's one action, and content in a
  `max-w-[1080px]` column with `gap-6` between sections. Below `lg` the
  sidebar becomes a fixed bottom tab bar of at most five items, and the header
  keeps the school name.
- **Public site** (`src/app/site/layout.tsx`): a centred `max-w-[72rem]`
  column, no sidebar.
- **Auth and standalone pages** (sign in, sign up, invite, on hold, offline):
  a single centred card, `max-w-[26rem]`, no chrome.

Page gutters are `clamp(16px, 3vw, 24px)`. Sections inside a page are
separated by `gap-6` (24px). Inside a card, `gap-4` (16px).

## Writing

The interface's words are part of it. Short sentences, sentence case, active
voice, the user's vocabulary — never the database's.

- Name things as a teacher would. "Marks", "classes", "sections", "students" —
  never `timetable_slots`, `attendance_records` or an event key.
- A button says what happens: "Submit attendance", "Mark all present",
  "Remind all 4 teachers". Not "Submit", not "OK".
- The same action keeps its name everywhere, and its confirmation matches:
  "Submit" produces "Submitted".
- An empty screen points at the thing that fills it, with a link. An error
  says what happened and what to do, in the interface's voice, and never
  apologises.
- A caption that states a fact ("28 of 32 sections are in") beats a label that
  states a category ("Status").

## Before you finish

- `npx tsc --noEmit`
- `npm run responsive` (dev server and seeded database running)
- Look at the page you changed at 390px and at 1280px. A screenshot beats a
  guess.
