// Demo Mode is read-only (GLOSSARY: Demo Mode; spec 0029, #271): visitors look around and switch between the demo's
// made-up people, but nothing they do is saved. The database refuses every write to the demo with the code below
// (migration 20261225110000_demo_read_only.sql); db.ts turns that code into DemoReadOnly, so whichever core function
// tried, the person reads the same sentence.
import { Forbidden, type Actor } from "./actor";
import { DEMO_DIGEST, DEMO_PROTECTED_DIGEST, DEMO_READ_ONLY, DEMO_READ_ONLY_TRIAL, DEMO_SEEDED_WORDS, DEMO_SHOWCASE, DEMO_STALE } from "./demo-words";
import { DEMO_WORKSPACE_ID } from "./team";
import { trialsOffered } from "./trials";
import { settingsInEffectNow } from "./settings-in-effect";
import { demoAllows } from "./demo-changes";

/** The error code the database raises for a write to the demo. */
export const DEMO_READ_ONLY_CODE = "ZF4D0";

/** The error code the database raises for a visit's write made after the demo started fresh (spec 0051). */
export const DEMO_STALE_CODE = "ZF4D1";

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
 * (a new person), a call to Slack or Telegram, an email. Everything else the database refuses itself. Named with the
 * server action it is for (demo-changes.ts), it lets the change on when the classification allows it (spec 0051:
 * the one place that asks; today it allows none, so the demo is as read-only as before); a place that cannot name one
 * always refuses, whatever the list says. */
export function refuseInDemo(actor: Pick<Actor, "workspaceId">, operation?: string): void {
  if (actor.workspaceId !== DEMO_WORKSPACE_ID) return;
  if (operation !== undefined && demoAllows(operation)) return;
  throw new DemoReadOnly();
}

/** The error code the database raises for a write that touches a showcase object (spec 0051, ticket 6). */
export const DEMO_SHOWCASE_CODE = "ZF4D3";

/** The error code the database raises for a change to a word of something the seed made. */
export const DEMO_WORDS_CODE = "ZF4D4";

/** A change refused because it touches an object the landing page and the tour point at: everyone sees it as it is. */
export class DemoShowcase extends Forbidden {
  /** Kept by Next.js in production for a plain form's error screen, which says the sentence for this fixed code. */
  readonly digest = DEMO_PROTECTED_DIGEST.showcase;
  constructor() {
    super(DEMO_SHOWCASE);
    this.name = "DemoShowcase";
  }
}

/** A change refused because it renames or rewrites something the seed made. */
export class DemoSeededWords extends Forbidden {
  /** As for DemoShowcase. */
  readonly digest = DEMO_PROTECTED_DIGEST.words;
  constructor() {
    super(DEMO_SEEDED_WORDS);
    this.name = "DemoSeededWords";
  }
}

/** The error a database error becomes when it is the showcase's or the seeded words' refusal, else null. */
export function protectedRefusal(e: unknown): Error | null {
  const code = typeof e === "object" && e !== null ? (e as { code?: unknown }).code : undefined;
  return code === DEMO_SHOWCASE_CODE ? new DemoShowcase() : code === DEMO_WORDS_CODE ? new DemoSeededWords() : null;
}

/** A visit's change refused because the demo started fresh since its page was drawn (spec 0051): what the page shows is gone. */
export class DemoStale extends Forbidden {
  /** Kept by Next.js in production for a plain form's error screen, which says the sentence for this fixed code. */
  readonly digest = DEMO_DIGEST.stale;
  constructor() {
    super(DEMO_STALE);
    this.name = "DemoStale";
  }
}
