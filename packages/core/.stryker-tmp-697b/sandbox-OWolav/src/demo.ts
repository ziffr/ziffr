// @ts-nocheck
// Demo Mode is read-only (GLOSSARY: Demo Mode; spec 0029, #271): visitors look around and switch between the demo's
// made-up people, but nothing they do is saved. The database refuses every write to the demo with the code below
// (migration 20261225110000_demo_read_only.sql); db.ts turns that code into DemoReadOnly, so whichever core function
// tried, the person reads the same sentence.
import { Forbidden, type Actor } from "./actor";
import { DEMO_DIGEST, DEMO_READ_ONLY, DEMO_READ_ONLY_TRIAL } from "./demo-words";
import { DEMO_WORKSPACE_ID } from "./team";
import { trialsOffered } from "./trials";
import { settingsInEffectNow } from "./settings-in-effect";

/** The error code the database raises for a write to the demo. */
export const DEMO_READ_ONLY_CODE = "ZF4D0";

/** The one sentence a refused change in the demo says, pointing to a trial where this Installation offers them. */
export function demoReadOnlyWords(env: Record<string, string | undefined> = settingsInEffectNow()): string {
  return trialsOffered(env) ? DEMO_READ_ONLY_TRIAL : DEMO_READ_ONLY;
}

/** A change refused because it was made in the demo. A Forbidden, so every place that shows a refusal shows it. */
export class DemoReadOnly extends Forbidden {
  /** Kept by Next.js in production, where it replaces the message of an error from a plain form's server action: the
   * error screen reads this fixed code and says the sentence (demo-words.ts). */
  readonly digest: string;
  constructor(env: Record<string, string | undefined> = settingsInEffectNow()) {
    super(demoReadOnlyWords(env));
    this.name = "DemoReadOnly";
    this.digest = trialsOffered(env) ? DEMO_DIGEST.trial : DEMO_DIGEST.plain;
  }
}

/** Refuses the demo before a change that does something the database cannot take back: a row outside the demo's
 * (a new person), a call to Slack or Telegram, an email. Everything else the database refuses itself. */
export function refuseInDemo(actor: Pick<Actor, "workspaceId">): void {
  if (actor.workspaceId === DEMO_WORKSPACE_ID) throw new DemoReadOnly();
}
