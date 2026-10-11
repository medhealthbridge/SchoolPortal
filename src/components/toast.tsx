"use client";

import { useEffect, useState } from "react";

type Item = { id: number; message: string; tone: "ok" | "danger" };

const listeners = new Set<(item: Item) => void>();
let nextId = 1;

/** Mounted once in the app layout, so a toast outlives the form that raised it. */
export function showToast(message: string, tone: Item["tone"] = "ok") {
  const item = { id: nextId++, message, tone };
  for (const l of listeners) l(item);
}

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(() => {
    const add = (item: Item) => {
      setItems((all) => [...all.slice(-2), item]);
      // Long results (an import summary) stay up long enough to read.
      const ms = Math.min(10000, 3000 + item.message.length * 40);
      setTimeout(() => setItems((all) => all.filter((i) => i.id !== item.id)), ms);
    };
    listeners.add(add);
    return () => {
      listeners.delete(add);
    };
  }, []);

  // Always rendered, even empty: a live region inserted together with its text
  // is commonly missed, so the region has to be there before the text arrives.
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-center gap-2 empty:hidden lg:bottom-6"
    >
      {items.map((i) => (
        <div
          key={i.id}
          className={`pointer-events-auto flex max-w-md items-start gap-3 rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg ${
            i.tone === "danger" ? "bg-[var(--absent-solid)] text-white" : "bg-ink text-surface"
          }`}
        >
          <span>{i.message}</span>
          <button
            type="button"
            aria-label="Dismiss"
            className="-my-2.5 -mr-2 flex min-h-11 min-w-11 items-center justify-center text-lg opacity-70 hover:opacity-100"
            onClick={() => setItems((all) => all.filter((x) => x.id !== i.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
