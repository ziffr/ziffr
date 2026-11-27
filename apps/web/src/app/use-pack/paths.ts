// The guided Pack set-up's addresses (spec 0068; GLOSSARY: Pack). Pure, so the pages, the actions and client components
// read the same.

/** The Packs page, where a person goes who leaves the flow. */
export const PACKS_PAGE = "/settings/packs";

/** The ways after a set-up, each a screen of its own. */
export const AFTER_TASKS = ["providers", "targets", "approver", "invite"] as const;
/** One of those ways. */
export type AfterTask = (typeof AFTER_TASKS)[number];
/** The address of one of those screens, for an install. */
export const afterHref = (installId: number, task: AfterTask) => `/use-pack/${installId}/${task}`;

/** Whether a Pack with parts of these kinds has anything to set up: a Dashboard, Deck or Workflow Template. Any other
 * is only added to the Workspace. */
export const setsUp = (kinds: readonly string[]) => kinds.some((k) => k === "dashboard" || k === "deck" || k === "workflow");

/** Where someone comes from who has seen the Pack's preview already, so the flow opens at its first question. */
export type FlowFrom = "preview" | "first-steps";
/** The flow's address, at its first question, for whoever saw the preview on the way there. */
export const fromPath = (path: string, from: FlowFrom) => `${path}?from=${from}`;
/** First Steps' screens a set-up that began there goes back to, and on to. */
export const FIRST_STEPS_SETS = "/first-steps?step=sets";
/** The screen that follows a set-up that began in First Steps: the first number. */
export const FIRST_STEPS_VALUE = "/first-steps?step=value";

const SLUG = /^([a-z0-9]+(?:-[a-z0-9]+)*)--([a-z0-9]+(?:-[a-z0-9]+)*)$/;

/** The flow's address for one of Ziffr's own Packs, by its id: the other way round from `packRefOf`. */
export function packSetUpPath(packId: string): string {
  return `/use-pack/${packId.replace("/", "--")}`;
}

/** Which Pack an address of the flow names: an install's number, or one of Ziffr's own Packs by its id written with two
 * hyphens for the slash (`ziffr--sales-forecast`). Null for anything else; the core checks that the Pack exists. */
export function packRefOf(segment: string): { install: number } | { included: string } | null {
  if (typeof segment !== "string" || segment.length > 130) return null;
  if (/^[1-9]\d{0,14}$/.test(segment)) return { install: Number(segment) };
  const m = SLUG.exec(segment);
  return m ? { included: `${m[1]}/${m[2]}` } : null;
}
