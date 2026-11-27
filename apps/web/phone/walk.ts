// How the phone check walks each Phone-first page on the demo's data (spec 0055; GLOSSARY: Route Tier, Demo Mode), or why
// it does not. route-tiers.test.ts fails when a Phone-first page is missing here. Pure data, so that test can read it.

/** Something pressed on the way, by its role and name; `to` is the address it leads to, when it leads to one. `missing` says
 * why your own demo may not have it: outside CI the page is then skipped, in CI it fails. */
export type Press = { role: "link" | "button" | "menuitem"; name: RegExp; to?: RegExp; missing?: string };

/** One page of the walk, from a fixed address, with words that show it is the right screen. From there it may `press` what a
 * person would, `follow` the first link (by address) that matches, and add `then` to the address it got to. */
export type Walk =
  | { open: string; press?: Press[]; follow?: RegExp; then?: string; sees: string | RegExp; signedOut?: boolean }
  | { skip: string };

const SIGNED_IN = "A demo visit is sent home from it: it needs a signed-in account, which the check does not make.";
const REDIRECT = "It has no screen of its own: it only sends the person on to another page.";
const MONTHLY: Press = { role: "link", name: /^Monthly overview/, to: /^\/dashboards\/\d+$/ };

/** Every Phone-first route and its walk. */
export const WALK: Record<string, Walk> = {
  "/": { open: "/", sees: "Monthly overview" },
  "/dashboards": { open: "/dashboards", sees: "Monthly overview" },
  "/dashboards/[id]": { open: "/dashboards", press: [MONTHLY], sees: "Monthly overview" },
  "/dashboards/[id]/present": { open: "/dashboards", press: [MONTHLY], then: "/present", sees: "Monthly overview" },
  "/dashboards/[id]/snapshots/[sid]": {
    open: "/dashboards",
    press: [
      { role: "link", name: /^Weekly numbers/, to: /^\/dashboards\/\d+$/ },
      { role: "button", name: /^More for this dashboard$/ },
      { role: "button", name: /Snapshots/ },
      { role: "menuitem", name: /20\d\d/, to: /^\/dashboards\/\d+\/snapshots\/\d+$/, missing: "This demo has no Snapshot: the demo's reset job takes them, the seed alone does not." },
    ],
    sees: "Weekly numbers",
  },
  // A View Link is made by a person, so the demo's seed has none: the page a dead link shows is walked.
  "/v/open/[key]": { open: "/v/open/gone", sees: "This link does not work", signedOut: true },
  "/gallery": { open: "/gallery", sees: "Gallery" },
  "/stories": { skip: REDIRECT },
  "/stories/[id]": { skip: REDIRECT },
  "/metrics": { open: "/metrics", sees: "Metrics" },
  "/metrics/[slug]": { open: "/metrics/gross-margin", sees: /gross margin/i },
  "/metrics/[slug]/[period]": { open: "/metrics/gross-margin?tab=history", follow: /^\/metrics\/gross-margin\/\d{4}-\d{2}-\d{2}$/, sees: /gross margin/i },
  "/submit/[code]": { open: "/submit/tk-mia-gross-margin", sees: "please report" },
  // A link is made only when a message goes, and the demo sends none: the page a dead link shows is walked.
  "/submit/all/[code]": { open: "/submit/all/gone", sees: "This link does not work", signedOut: true },
  "/schedule/submit/[slug]": { skip: REDIRECT },
  "/paste-values": { open: "/paste-values", sees: /paste/i },
  "/schedule": { open: "/schedule", sees: "Schedule" },
  "/actions": { skip: REDIRECT },
  "/actions/[id]": { open: "/schedule?view=asked", follow: /^\/actions\/\d+$/, sees: "Schedule" },
  "/actions/share/[id]": { skip: "The demo's seed has no Share Proposal." },
  "/login": { open: "/login", sees: "Sign in", signedOut: true },
  // Any other token shows the same page; a real Invitation is only made by a signed-in person.
  "/invite/[token]": { open: "/invite/no-such-invitation", sees: "This invitation does not work" },
  "/welcome": { skip: SIGNED_IN },
  "/first-steps": { skip: "switched off until every screen is built (spec 0067)" },
  "/setup": { skip: SIGNED_IN },
  "/try": { skip: SIGNED_IN },
  "/try/start": { skip: SIGNED_IN },
  "/use-pack/[ref]": { skip: "switched off until every entry point switches over (spec 0068)" },
  "/use-pack/[ref]/[task]": { skip: "switched off until every entry point switches over (spec 0068)" },
  "/demo/confirm": { open: "/demo/confirm", sees: "Open the demo?" },
  "/oauth/authorize": { skip: "Needs an assistant's own request and a signed-in account." },
};
