/**
 * A school stores its own colour (`schools.primary_color`). The interface is
 * deliberately neutral — one near-black for every primary action — so that
 * colour is used in exactly one place: the brand badge, where a school sees
 * itself without the rest of the page arguing with it.
 */
const FALLBACK = "#171717";

function channel(hex: string, from: number) {
  const v = parseInt(hex.slice(from, from + 2), 16) / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance, so the badge's text is readable on any colour. */
export function readableOn(background: string): "#FFFFFF" | "#0A0A0A" {
  const hex = /^#[0-9a-f]{6}$/i.test(background) ? background : FALLBACK;
  const l =
    0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
  // Contrast against white vs against near-black; pick the better one.
  const onWhite = 1.05 / (l + 0.05);
  const onInk = (l + 0.05) / 0.098;
  return onInk >= onWhite ? "#0A0A0A" : "#FFFFFF";
}

export function brandStyle(color: string | null | undefined) {
  const background = color && /^#[0-9a-f]{6}$/i.test(color) ? color : FALLBACK;
  return {
    "--school-badge": background,
    "--school-badge-fg": readableOn(background),
  } as React.CSSProperties;
}

/** "St. Mary Academy" → "SM": the badge a school has before it uploads a logo. */
export function initialsOf(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
