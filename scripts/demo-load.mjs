// Hammers a demo to see that its limits hold (spec 0051, ticket 5; GLOSSARY: Demo Mode): several visits write at once at
// the budget while the demo's reset runs, and the script reports where the first refusal came, how long a plain page
// took before, during and after, and whether the reset finished. Run it against a demo box you own (a copy, or
// preview.ziffr.net), never against someone else's server, and never against the live demo while people look at it.
//
//   ZIFFR_DEMO_URL=https://demo.example.net ZIFFR_DEMO_WRITE_PATH=/demo/some-write ZIFFR_JOB_SECRET=... \
//   node scripts/demo-load.mjs [--visits 20] [--per-visit 40] [--reset --yes-this-is-the-demo]
//
// It needs a running demo box where visitors may change the demo (ZIFFR_DEMO_ONLY=1, ZIFFR_DEMO_CHANGES=1, the address
// key ZIFFR_DEMO_ADDRESS_KEY and ZIFFR_PROXY_HOPS set) and at least one change a visit can make: the write is a POST to
// ZIFFR_DEMO_WRITE_PATH with the body in ZIFFR_DEMO_WRITE_BODY (default an empty form), sent with a visit cookie of its
// own each time (128 random bits, as the middleware makes them), so a script that mints visits is what is tried. Until
// a ticket of spec 0051 opens a change, every write is refused as read-only and the script says so and stops.
//
// What it checks, and exits 1 for:
//   - the demo answers a limit refusal within 1.5 times the address budget's writes from this one address;
//   - a plain page (the demo's home) stays under 3 times its idle time while the writes run;
//   - with --reset (and ZIFFR_JOB_SECRET), the reset job answers 200 while the writes run.
// Safety: the URL must be https (plain http only for localhost). The job secret is sent only with --reset AND
// --yes-this-is-the-demo, only to the URL given here, and never follows a redirect. A redirect to sign-in stops the run.
// Nothing it sends leaves the demo: the demo sends no message, whatever is written.
import { randomBytes } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";

const BASE = (process.env.ZIFFR_DEMO_URL || "http://localhost:3000").replace(/\/$/, "");
const WRITE_PATH = process.env.ZIFFR_DEMO_WRITE_PATH;
const WRITE_BODY = process.env.ZIFFR_DEMO_WRITE_BODY || "";
const SECRET = process.env.ZIFFR_JOB_SECRET;
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : fallback; };
const VISITS = arg("visits", 20);
const PER_VISIT = arg("per-visit", 40);
const WITH_RESET = process.argv.includes("--reset");
const SURE = process.argv.includes("--yes-this-is-the-demo");
// The address budget of spec 0051 (packages/core/src/demo-limits.ts: perAddressPerWindow), which this one address meets first.
const ADDRESS_BUDGET = 200;

const url = (() => { try { return new URL(BASE); } catch { return null; } })();
const local = url !== null && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
if (!url || !(url.protocol === "https:" || (url.protocol === "http:" && local))) {
  console.error("ZIFFR_DEMO_URL must be an https address (plain http only for localhost).");
  process.exit(1);
}
if (WITH_RESET && !SURE) {
  console.error(`--reset sends the job secret to ${url.origin}: add --yes-this-is-the-demo if that is the demo you mean to hammer.`);
  process.exit(1);
}
if (!WRITE_PATH || !WRITE_PATH.startsWith("/") || WRITE_PATH.startsWith("//")) {
  console.error("Set ZIFFR_DEMO_WRITE_PATH to a POST path a visitor can write through, starting with one slash (see the top of this file).");
  process.exit(1);
}

// The sentences of packages/core/src/demo-words.ts (a unit test checks that they are still there), matched whole.
const READ_ONLY = "The demo can't be changed.";
const REFUSALS = ["You are going fast. Try again in a minute.", "You have made a lot of changes. Try again when the demo starts fresh.", "The demo is busy. Try again in a few minutes."];
const FULL = /The demo is full (?:of [^.]+ )?for now\. Try again when it starts fresh\./;
const CURLY = String.fromCharCode(0x2019);

/** The text as a person reads it: HTML escapes of the apostrophe and ampersand undone, a curly apostrophe made straight. */
const plain = (text) => text.replaceAll(CURLY, "'").replace(/&(?:#x27|#39|apos);/g, "'").replace(/&amp;/g, "&");

const visitCookie = () => `ziffr-demo=${randomBytes(16).toString("hex")}`;

/** One write by one visit; answers the status, how long it took, the text as read, and whether it was sent to sign-in. */
async function write(cookie) {
  const t = performance.now();
  const res = await fetch(BASE + WRITE_PATH, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: BASE }, body: WRITE_BODY, redirect: "manual" });
  const text = plain(await res.text());
  const to = res.headers.get("location") || "";
  return { status: res.status, ms: performance.now() - t, text, signedOut: res.status >= 300 && res.status < 400 && /\/(login|sign-in)(\/|\?|$)/.test(to) };
}

/** How long the demo's home takes to answer. */
async function page() {
  const t = performance.now();
  const res = await fetch(`${BASE}/demo`, { headers: { cookie: visitCookie() }, redirect: "manual" });
  await res.arrayBuffer();
  return performance.now() - t;
}

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const sample = async (n) => { const out = []; for (let i = 0; i < n; i++) { out.push(await page()); await sleep(100); } return out; };

const idle = median(await sample(10));
console.log(`Idle page: ${idle.toFixed(0)} ms (median of 10)`);

// A first write tells whether anything is open at all.
const first = await write(visitCookie());
if (first.signedOut) {
  console.error("The write was sent to sign-in: the demo is not open to this visit, or the path is not a demo write.");
  process.exit(1);
}
if (first.text.includes(READ_ONLY) || first.status === 404) {
  console.error("The demo refuses every write as read-only: nothing is open yet, so there are no limits to try.");
  process.exit(1);
}

const during = [];
let sent = 0;
let firstRefusal = null;
let resetStatus = null;
let running = true;
const watcher = (async () => { while (running) { during.push(await page()); await sleep(250); } })();
// The secret goes only to this URL's origin, only with the flag, and a redirect is never followed.
const resetter = WITH_RESET && SURE && SECRET
  ? (async () => { await sleep(2000); const res = await fetch(`${url.origin}/api/jobs/demo-reset`, { method: "POST", headers: { authorization: `Bearer ${SECRET}` }, redirect: "manual" }); resetStatus = res.status; })()
  : null;

const visits = Array.from({ length: VISITS }, visitCookie);
await Promise.all(visits.map(async (cookie) => {
  for (let i = 0; i < PER_VISIT; i++) {
    const r = await write(cookie);
    sent += 1;
    if (r.signedOut) { console.error("A write was sent to sign-in: stopping."); process.exit(1); }
    if (firstRefusal === null && (REFUSALS.some((w) => r.text.includes(w)) || FULL.test(r.text))) firstRefusal = sent;
  }
}));
running = false;
await Promise.all([watcher, resetter].filter(Boolean));

const duringMedian = during.length ? median(during) : idle;
const after = median(await sample(10));
console.log(`Writes sent: ${sent} from ${VISITS} visits; first refusal at request ${firstRefusal ?? "never"}`);
console.log(`Page during: ${duringMedian.toFixed(0)} ms, after: ${after.toFixed(0)} ms`);
if (WITH_RESET) console.log(`Reset job: ${resetStatus ?? "not run (set ZIFFR_JOB_SECRET)"}`);

const failures = [];
if (firstRefusal === null || firstRefusal > ADDRESS_BUDGET * 1.5) failures.push("no limit refusal came within 1.5 times the address budget");
if (duringMedian > idle * 3) failures.push("the page slowed to more than 3 times its idle time while writes ran");
if (WITH_RESET && resetStatus !== 200) failures.push("the reset job did not answer 200");
if (failures.length) { console.error(`FAILED: ${failures.join("; ")}`); process.exit(1); }
console.log("OK: the limits held.");
