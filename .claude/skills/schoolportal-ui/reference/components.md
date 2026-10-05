# Components

All in `src/components/ui.tsx` unless noted. Build from these; add a new one
here rather than styling a `<div>` in a page.

## Structure

- **`Card`** — a white surface with a 14px radius, a 1px line and the card
  shadow. `title`, `subtitle`, `actions`, `children`. A card's header padding
  is `20px 24px 16px`, its body `0 24px 20px`; pass `flush` when the body is a
  table that should meet the card's edges.
- **`Section`** — a titled block that is *not* a card, for a page's own
  headings. Use a card unless the content is a list of cards.
- **`Toolbar`** — the 56px header strip inside a shell: breadcrumb on the
  left, at most one action on the right.

## Controls

- **`Button`** — `primary` (near-black, no shadow), `secondary` (white, line,
  control shadow), `danger`, `ghost`. 44px tall, 48 with `size="lg"`. Always
  give it a verb.
- **`LinkButton`** — the same shapes as an `<a>`.
- **`Field`** + **`Input`** / **`Select`** / **`Textarea`** — a label above,
  an optional hint below, 44px tall, 16px text, `--line-strong` border and the
  control shadow. The label is a real `<label for>`.
- **`SegmentedStatus`** — the P/A/L/E group on a roster row: four 44px
  buttons, joined, `aria-pressed` on the chosen one, solid colour when chosen.
- **`Segmented`** — a two-or-three-way view switch (Seats / List) on a
  `--subtle` track, 40px tall, the chosen one white with the card shadow.

## Data

- **`Table`** — `head` is an array of nodes. Header row is 40px, `--muted`,
  weight 500, with a bottom line; body rows divide on `--line`. Wrap it in a
  card with `flush`, and give the wrapper `overflow-x-auto` plus a `min-width`
  so wide tables scroll inside the card instead of stretching the page.
- **`StatTile`** — a label, a 30px tabular number, a caption that states a
  fact, and an optional pill in the corner. Use a grid of
  `repeat(auto-fit, minmax(min(180px, 100%), 1fr))`.
- **`SplitBar`** — the four marks in proportion as one 8px bar. Takes the same
  counts object as `StatusBadge`. Give it an `aria-label` that reads the
  numbers out.
- **`Progress`** — one small square per class, filled when that class has
  submitted, with "9 of 15 classes" underneath. Better than a percentage when
  the reader's next question is "which ones".
- **`Pill`** — a 12px chip: `neutral`, `ok`, `warn`, `danger`, `solid`.

## Attendance

- **`StatusBadge`** — the letter in a coloured square plus the word. For
  reading, not for changing.
- **`SeatChip`** — one seat: surname, a second line (initials when present,
  the status word otherwise), soft colours, 46px tall. Tapping cycles
  present → absent → late → excused.
- **`SeatGrid`** — lays chips on the saved seat plan, labels the front of the
  room, and scrolls sideways on a phone rather than squeezing out the names. A
  list view is always one tap away.

## Feedback

- **`Callout`** — `info`, `ok`, `warn`, `danger`. An icon, a bold first line,
  an explanation, and at most one action on the right. This is the offline
  notice, the past-due banner and the "homeroom not submitted" nudge.
- **`EmptyState`** — a sentence saying what is missing and a link to the page
  that fills it. Never a bare "No data".

## Icons

Inline stroke SVG, `stroke-width` 2 at 16px and 1.5 at 20px, `currentColor`,
`aria-hidden`. No icon font, no emoji. Keep them in
`src/components/icons.tsx` so a glyph is drawn once.

## Gotchas that have already bitten

- **`.sr-only` must not be absolutely positioned.** Tailwind's own `.sr-only`
  is `position: absolute`, and an absolute box inside a horizontally scrolled
  table takes the initial containing block, so its static position lands past
  the scrollport and stretches the whole page sideways. `globals.css`
  overrides it with `position: static` + `display: inline-block`. The
  override has to declare `position` explicitly — the cascade resolves per
  property, so merely omitting it leaves Tailwind's `absolute` in place.
- **Base element rules belong in `@layer base`.** An unlayered rule beats
  every layered one, so a bare `a { color: … }` silently overrides `text-…`
  on every link button.
- **A wide table needs three things** or it will stretch the page: the
  `Section` must be `flush`, the `Table` needs a `minWidth`, and the card has
  `min-w-0` (it already does). The scroll box lives inside `Table`.
- **A file input is as wide as its browser chrome.** Give it
  `block w-full max-w-full` or it overflows at 320px.
