"use client";

import { useState } from "react";
import { initialsOf, readableOn } from "@/lib/brand";

/**
 * The brand colour, with the badge it will colour shown beside it.
 *
 * A native colour input cannot produce an invalid value, so the server's
 * `#RRGGBB` check is a backstop here rather than something a person meets.
 * The preview uses the same `readableOn` the real badge uses, so what is
 * shown is what is saved — including the text flipping to dark on a pale
 * colour, which is the thing a school would otherwise discover afterwards.
 */
export function BrandColorField({
  name,
  initial,
  schoolName,
}: {
  name: string;
  initial: string;
  schoolName: string;
}) {
  const [color, setColor] = useState(initial);

  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        name={name}
        value={color}
        onChange={(e) => setColor(e.target.value)}
        aria-label="Brand colour"
        className="h-11 w-16 shrink-0 cursor-pointer rounded-control border border-line-strong bg-surface p-1 shadow-control"
      />
      <span
        aria-hidden
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-[13px] font-semibold"
        style={{ background: color, color: readableOn(color) }}
      >
        {initialsOf(schoolName)}
      </span>
      <span className="tabular-nums text-sm text-muted">{color.toUpperCase()}</span>
    </div>
  );
}
