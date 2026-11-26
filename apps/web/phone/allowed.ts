// What the phone check lets pass (spec 0055; GLOSSARY: Route Tier). Each entry names one rule and one narrow selector,
// the pages it holds for, and why. An entry for something still to be fixed goes away with the fix.
import type { Allowance } from "./measure";

// Nothing is let off today.
const ALLOWED: Allowance[] = [];

/** The entries that hold on one route: those for every page and those that name it. */
export const allowancesFor = (route: string): Allowance[] => ALLOWED.filter((a) => !a.routes || a.routes.includes(route));
