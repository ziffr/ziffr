// What the phone check lets pass (spec 0055; GLOSSARY: Route Tier). Each entry names one rule and one narrow selector,
// the pages it holds for, and why. An entry for something still to be fixed goes away with the fix.
import type { Allowance } from "./measure";

// What main already broke when the check arrived (#1130), still to be fixed.
const ALLOWED: Allowance[] = [
  { rule: "tap-target", selector: 'section a[href="/metrics/gross-margin"]', routes: ["/metrics/[slug]/[period]"], reason: "Period Record: the Metric's name, which leads to the Metric, is 20 px high." },
  { rule: "tap-target", selector: 'header > a[href="/"]', reason: "The word Ziffr in the phone header, which leads home, is 24 px high." },
  { rule: "tap-target", selector: '.desk > header :is([aria-label="Overview"], [aria-label="One at a time"], [aria-label="Stop presenting"])', routes: ["/dashboards/[id]/present"], reason: "Presenting a dashboard: the view switch and Close are 36 px wide on a phone." },
  { rule: "tap-target", selector: 'a[href="/guide"]', routes: ["/login"], reason: "Sign-in: the User guide link is 20 px high." },
  { rule: "tap-target", selector: 'a[href="/demo"]', routes: ["/login"], reason: "Sign-in: the Try the demo link below the card is 17 px high." },
];

/** The entries that hold on one route: those for every page and those that name it. */
export const allowancesFor = (route: string): Allowance[] => ALLOWED.filter((a) => !a.routes || a.routes.includes(route));
