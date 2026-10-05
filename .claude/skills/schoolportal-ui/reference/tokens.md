# Tokens

Every value here is defined once in `src/app/globals.css`, as a CSS variable
and as a Tailwind theme colour. Use the Tailwind name in components; reach for
`var(--…)` only in an inline `style` where a value is computed.

## Neutrals

| Token | Hex | Tailwind | Used for |
| --- | --- | --- | --- |
| `--ground` | `#FAFAFA` | `bg-ground` | The page behind the cards; the sidebar |
| `--surface` | `#FFFFFF` | `bg-surface` | Cards, tables, the desktop content area |
| `--subtle` | `#F5F5F5` | `bg-subtle` | Chips, segmented-control track, avatars |
| `--hover` | `#F0F0F0` | `bg-hover` | The active nav item, row hover |
| `--line` | `#E5E5E5` | `border-line` | Every border and divider |
| `--line-strong` | `#D4D4D4` | `border-line-strong` | Input borders, dashed placeholders |
| `--ring` | `#A1A1A1` | — | The focus outline |
| `--muted` | `#737373` | `text-muted` | Secondary text, captions, table heads |
| `--muted-strong` | `#525252` | `text-muted-strong` | An inactive tab's label |
| `--primary` | `#171717` | `bg-primary` | Primary buttons, the active ink |
| `--ink` | `#0A0A0A` | `text-ink` | Body text and headings |

`#0A0A0A` on `#FAFAFA` is 18.9:1. `#737373` on `#FFFFFF` is 4.7:1, so it
passes at 14px — do not lighten it. `#FAFAFA` on `#171717` is 16.5:1.

## Attendance marks

Each mark has a soft form (a tinted chip, used on the seat map and in tables)
and a solid form (used when the mark is the selected option in a segmented
control). Present is deliberately the quietest: a room is mostly present, and
the exceptions should carry the eye.

| Mark | Soft bg | Soft border | Soft text | Solid bg | Solid text |
| --- | --- | --- | --- | --- | --- |
| Present `P` | `#FFFFFF` | `#E5E5E5` | `#0A0A0A` | `#171717` | `#FAFAFA` |
| Absent `A` | `#FEF2F2` | `#FCA5A5` | `#B91C1C` | `#DC2626` | `#FFFFFF` |
| Late `L` | `#FFFBEB` | `#FCD34D` | `#92400E` | `#FDE68A` | `#451A03` |
| Excused `E` | `#F5F3FF` | `#C4B5FD` | `#5B21B6` | `#6D28D9` | `#FFFFFF` |

In a proportional bar the four read as `#171717`, `#F59E0B`, `#DC2626`,
`#C4B5FD` — those differ in lightness, not only hue, so they survive
greyscale and the common colour-vision deficiencies.

## Other states

| Token | Hex | Used for |
| --- | --- | --- |
| `--ok` / `--ok-bg` / `--ok-line` | `#15803D` / `#F0FDF4` / `#BBF7D0` | A submitted class, a success note |
| `--ok-dot` | `#16A34A` | The "synced" dot |
| `--warn` / `--warn-bg` / `--warn-line` | `#92400E` / `#FFFBEB` / `#FCD34D` | Past due, not yet marked |
| `--danger` / `--danger-bg` / `--danger-line` | `#B91C1C` / `#FEF2F2` / `#FCA5A5` | A failed action, a suspension |
| `--danger-icon` | `#E7000B` | The alert glyph only |

## Type

**Geist**, loaded through `next/font/google` as `--font-geist`, weights
400/500/600/700. One family, no second face.

| Role | Size | Weight | Tracking | Line height |
| --- | --- | --- | --- | --- |
| Page title (`h1`) | 24px | 600 | −0.02em | 1.2 |
| Stat number | 30px desktop, 20px phone | 600 | −0.02em | 1 |
| Card title (`h2`) | 16px | 600 | 0 | 1 |
| Class title | 20px | 600 | −0.01em | 1.2 |
| Body, controls | 14px | 400/500 | 0 | 1.45 |
| Secondary | 13px | 400 | 0 | 1.3 |
| Caption, pill | 12px | 500 | 0 | 1.3 |
| Mobile text input | **16px** | 400 | — | — |

The 16px on a mobile input is not a style choice: anything smaller makes iOS
Safari zoom the page when the field is focused.

No all-caps labels, and no letter-spaced eyebrows above headings.

## Shape, depth, spacing

| Token | Value | Used for |
| --- | --- | --- |
| `--r-card` | 14px | Cards and tables |
| `--r-panel` | 10px | Callouts, the segmented track |
| `--r-control` | 8px | Buttons, inputs, nav items, seats |
| `--r-pill` | 9999px | Pills, avatars, dots |
| `--shadow-card` | `0 1px 3px rgb(0 0 0 / .1), 0 1px 2px -1px rgb(0 0 0 / .1)` | Cards |
| `--shadow-control` | `0 1px 2px rgb(0 0 0 / .05)` | Secondary buttons, inputs |

Primary buttons carry no shadow. Nothing else on the page casts one.

Heights: 44 touch target · 48 primary submit on a phone · 52 bottom tab ·
56 header · 40 segment and table head · 46 seat · 60 list row.
Avatars: 28 in a table, 32 in a sidebar, 40 in a phone header.

## Focus

```css
outline: 3px solid var(--ring);
outline-offset: 2px;
```

Applied globally in `globals.css` to `:focus-visible`. Never remove it, and
never replace it with a shadow — it has to survive on both the white surface
and the near-black primary button.
