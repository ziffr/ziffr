// The guided Pack set-up's switch and addresses (spec 0068; GLOSSARY: Pack). The flow is built in tickets and stays off
// until the one that switches every entry point over; while it is off the page and its actions answer "not found" and
// nothing links to it. Pure, so the page, the actions and client components read the same.

/** Whether "Use this pack" is switched on. Typed as a boolean, so the code behind it is checked while it is off. */
export const PACK_SET_UP_ON: boolean = false;

/** The Packs page, where a person goes who leaves the flow. */
export const PACKS_PAGE = "/settings/packs";

/** The ways after a set-up, each a screen of its own. */
export const AFTER_TASKS = ["providers", "targets", "approver", "invite"] as const;
/** One of those ways. */
export type AfterTask = (typeof AFTER_TASKS)[number];
/** The address of one of those screens, for an install. */
export const afterHref = (installId: number, task: AfterTask) => `/use-pack/${installId}/${task}`;

const SLUG = /^([a-z0-9]+(?:-[a-z0-9]+)*)--([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** Which Pack an address of the flow names: an install's number, or one of Ziffr's own Packs by its id written with two
 * hyphens for the slash (`ziffr--sales-forecast`). Null for anything else; the core checks that the Pack exists. */
export function packRefOf(segment: string): { install: number } | { included: string } | null {
  if (typeof segment !== "string" || segment.length > 130) return null;
  if (/^[1-9]\d{0,14}$/.test(segment)) return { install: Number(segment) };
  const m = SLUG.exec(segment);
  return m ? { included: `${m[1]}/${m[2]}` } : null;
}
