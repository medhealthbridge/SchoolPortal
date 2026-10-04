"use client";

/**
 * The phone's side of offline attendance: a tiny IndexedDB with two stores,
 * `queue` (taps not yet uploaded) and `cache` (this morning's download).
 *
 * Deliberately dependency-free — it is ~100 lines and runs on every browser
 * the schools actually use.
 */
const DB_NAME = "schoolportal";
const DB_VERSION = 1;

export type QueuedRecord = {
  id: string;
  studentId: string;
  slotId: string;
  onDate: string;
  status: "present" | "absent" | "late" | "excused";
  note?: string | null;
  markedAt: string;
};

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("queue")) db.createObjectStore("queue", { keyPath: "id" });
      if (!db.objectStoreNames.contains("cache")) db.createObjectStore("cache");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const queue = {
  async put(record: QueuedRecord) {
    await tx("queue", "readwrite", (s) => s.put(record));
  },
  async all(): Promise<QueuedRecord[]> {
    return (await tx<QueuedRecord[]>("queue", "readonly", (s) => s.getAll())) ?? [];
  },
  async remove(ids: string[]) {
    const db = await open();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction("queue", "readwrite");
      const store = t.objectStore("queue");
      for (const id of ids) store.delete(id);
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  },
  async countForSlot(slotId: string, onDate: string) {
    const all = await queue.all();
    return all.filter((r) => r.slotId === slotId && r.onDate === onDate).length;
  },
};

export const localCache = {
  async set(key: string, value: unknown) {
    await tx("cache", "readwrite", (s) => s.put(value, key));
  },
  async get<T>(key: string): Promise<T | undefined> {
    return tx<T>("cache", "readonly", (s) => s.get(key));
  },
};

/** Uploads everything queued. Safe to call repeatedly. */
export async function drainQueue(): Promise<{ sent: number; left: number }> {
  const records = await queue.all();
  if (records.length === 0) return { sent: 0, left: 0 };

  let res: Response;
  try {
    res = await fetch("/api/attendance/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ records }),
    });
  } catch {
    // No signal. The taps stay in the queue and go up on the next try.
    return { sent: 0, left: records.length };
  }
  if (!res.ok) return { sent: 0, left: records.length };

  const outcome: { accepted: string[]; ignored: string[]; rejected?: string[] } =
    await res.json();
  // Rejected taps are settled too: retrying one never succeeds.
  const settled = [...outcome.accepted, ...outcome.ignored, ...(outcome.rejected ?? [])];
  await queue.remove(settled.length ? settled : records.map((r) => r.id));
  return { sent: settled.length, left: (await queue.all()).length };
}

export function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  navigator.serviceWorker.addEventListener("message", (event) => {
    if ((event.data as { type?: string })?.type === "drain-queue") void drainQueue();
  });
}

export function uuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback for older WebViews.
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (
      Number(c) ^
      (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))
    ).toString(16),
  );
}
