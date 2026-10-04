/* SchoolPortal service worker: keeps attendance usable with no signal. */
const VERSION = "sp-v1";
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;

const SHELL_URLS = ["/attendance", "/offline", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(SHELL_URLS).catch(() => undefined)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Today's timetable and class lists: serve from the network when there is
  // one, fall back to the copy downloaded this morning.
  if (url.pathname.startsWith("/api/attendance/")) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(DATA).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit ?? offlineJson())),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((cache) => cache.put(request, copy));
          return res;
        })
        .catch(async () => (await caches.match(request)) ?? (await caches.match("/offline"))),
    );
  }
});

function offlineJson() {
  return new Response(JSON.stringify({ error: "offline" }), {
    status: 503,
    headers: { "content-type": "application/json" },
  });
}

/* Background sync, where the browser supports it: the queue is drained by the
   page as well, so this is an extra chance rather than the only one. */
self.addEventListener("sync", (event) => {
  if (event.tag === "attendance-sync") {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        for (const client of clients) client.postMessage({ type: "drain-queue" });
      }),
    );
  }
});
