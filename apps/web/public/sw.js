// Ziffr's service worker (#143): it lets Ziffr install as an app and shows a page saying Ziffr needs a connection
// when a page cannot be reached. Registered only in production builds (components/service-worker.tsx).
//
// THE RULE: this worker caches only the static shell listed in SHELL: the offline page, a file that is the same for
// everyone and carries no Workspace data. It never caches, and never answers from a cache, any page, API response,
// server action, RSC payload or anything else the server sends for a signed-in person. So nothing it keeps can
// outlive a sign-out or reach another person on the same device. Pages always come from the network; only
// when that fails does the worker answer with the offline page.
//
// It stays out of the way entirely (the browser handles the request as if there were no worker) for anything that is
// not a GET page load from this site, which covers server actions (POST), RSC and API fetches, and for the paths
// where sign-in happens or programs connect: sign-in links and /auth/callback, /login, the API, the MCP and OAuth
// routes, and /.well-known.

// A changed offline.html needs a new name here: only a changed worker fetches the shell again.
const CACHE = "ziffr-shell-v2";
const OFFLINE = "/offline.html";
const SHELL = [OFFLINE];
const HANDS_OFF = [/^\/auth\//, /^\/login(\/|$)/, /^\/api\//, /^\/mcp(\/|$)/, /^\/oauth(\/|$)/, /^\/\.well-known\//];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

// Old shells go, and an earlier worker's caches with them.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.mode !== "navigate") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || HANDS_OFF.some((r) => r.test(url.pathname))) return;
  // Straight from the network, and not stored: the offline page only when the network fails.
  event.respondWith(fetch(req).catch(() => caches.match(OFFLINE).then((page) => page || Response.error())));
});
