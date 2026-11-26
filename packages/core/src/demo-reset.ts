// Resetting the demo (ADR 0005, GLOSSARY: Demo Mode): the demo workspace emptied and seeded again in one locked step
// in the database, then what SQL cannot make: its Snapshots, whose values the core computes (spec 0013), and its
// Outbox, the morning's Prompts and reminders as the core sends them, so visitors find messages to answer in the
// simulators. Real workspaces are never touched. Visitors cannot change the demo (#271), so there is nothing of theirs
// to undo. The seed's dates follow the calendar it runs on (its history ends in the current month), so the job a public
// demo calls each night seeds it again and its periods keep reaching up to today. Docker's first start and
// `prototype:reset` seed it too, in SQL only.
import { db, seedingDemo } from "./db";
import { shouldResetDemo, type DemoState } from "./demo-reset-decision";
import { scanWorkspace } from "./heads-ups";
import { seedDemoSnapshots } from "./demo-snapshots";
import { clearDemoVisitCounts } from "./demo-visit";
import { askForMissingValues, sendDueReminders } from "./questions";
import { DEMO_WORKSPACE_ID } from "./team";

/** The demo's state: its Generation (moved by every reset, in the database), whether a visitor changed it since, when it was last reset, and whether its seed finished (`showcase_ready` and `seed_done_at`; a demo whose seed failed has neither). Null when the row is not there. */
export async function readDemoState(): Promise<DemoState | null> {
  const { data, error } = await db().from("demo_state").select("generation, changed_since_reset, last_change_at, reset_at, showcase_ready, seed_done_at").maybeSingle();
  if (error) throw new Error("The demo's state could not be read.");
  if (!data) return null;
  const date = (v: string | null) => (v ? new Date(v) : null);
  return {
    generation: Number(data.generation),
    changedSinceReset: Boolean(data.changed_since_reset),
    lastChangeAt: date(data.last_change_at),
    resetAt: date(data.reset_at),
    showcaseReady: Boolean(data.showcase_ready),
    seedDoneAt: date(data.seed_done_at),
  };
}

/** Whether this Installation is demo-only in fact: no Workspace other than the demo's exists. A failed read counts as "no" (fail closed). */
async function demoIsTheOnlyWorkspace(): Promise<boolean> {
  const { data, error } = await db().from("workspaces").select("id").neq("id", DEMO_WORKSPACE_ID).limit(1);
  return !error && (data ?? []).length === 0;
}

/** Tells the database whether this Installation lets visitors change its demo (the setting in effect, which only the core can read). The database refuses a visit's write unless this is on, so it is set on every call of the reset job and off by default. Switching it on is refused, loudly, where a Workspace other than the demo exists (the database refuses such visits too, migration 20270131090000).  */
async function setOpenToVisitors(on: boolean): Promise<void> {
  if (on && !(await demoIsTheOnlyWorkspace())) {
    console.error("demo: not demo-only: a Workspace other than the demo exists; visitors may not change the demo");
    on = false;
  }
  const { error } = await db().from("demo_state").update({ open_to_visitors: on }).eq("id", true);
  if (error) throw new Error("The demo's state could not be changed.");
}

/** Runs one step of the seed after the reset; a failure is logged and the later steps still run, but the caller then does not mark the seed done. Returns whether it worked. */
async function step(what: string, run: () => PromiseLike<unknown>): Promise<boolean> {
  try {
    const result = await run();
    // A database call answers with an error instead of throwing.
    const failed = typeof result === "object" && result !== null && "error" in result ? (result as { error: { message?: string } | null }).error : null;
    if (failed) { console.error(`Demo: ${what}`, failed.message); return false; }
    return true;
  } catch (e) {
    console.error(`Demo: ${what}`, e instanceof Error ? e.message : e);
    return false;
  }
}

/** Resets the demo. False when it was reset less than a minute ago, or, with `onlyWhenNeeded` (where visitors may change the demo), when nothing changed since its last reset and it is still young. */
export async function resetDemoWorkspace(opts: { onlyWhenNeeded?: boolean; openToVisitors?: boolean } = {}): Promise<boolean> {
  // First, so a switched-off setting closes the door at the next call (the clock makes one every 15 minutes) before any work.
  await setOpenToVisitors(opts.openToVisitors === true);
  if (opts.onlyWhenNeeded && !shouldResetDemo({ changesInEffect: true, state: await readDemoState(), now: new Date() })) return false;
  const { data: done, error } = await db().rpc("demo_reset");
  if (error) throw new Error("The demo could not be reset. Try again in a minute.");
  if (!done) return false;
  // The Generation this reset made: the seed's end is marked for it alone, so a reset that overlaps a newer one cannot mark the newer seed done.
  const generation = (await readDemoState())?.generation;
  // Each step below is tried on its own: one that fails is logged and the later ones still run. Only a seed that finished
  // whole is marked done (and the showcase, which makes the demo ready for visits, is last): a failed one stays closed
  // to visitors, and the next call of the reset job resets again (shouldResetDemo).
  let whole = true;
  const ok = async (what: string, run: Parameters<typeof step>[1]) => { if (!(await step(what, run))) whole = false; };
  // The three years of history are seeded by a function of their own (#987), before anything that reads the values: the Snapshots, the close.
  await ok("no three years of history", () => db().rpc("prototype_seed_history"));
  // The Heads-up job never scans the demo, so the pairs that move together are looked at here, once a night, as the job would look at a Workspace.
  await ok("no Heads-ups", () => seedingDemo(() => scanWorkspace(DEMO_WORKSPACE_ID, new Date().toISOString())));
  // The visits' counts belong to the window that just ended (spec 0051); a new window starts at zero.
  await ok("visit counts not emptied", () => clearDemoVisitCounts());
  // The demo's people's paste claims (their day's limit, kept per person, no workspace_id) are the old window's too.
  await ok("paste claims not emptied", async () => {
    const { data: people } = await db().from("memberships").select("user_id").eq("workspace_id", DEMO_WORKSPACE_ID);
    const ids = (people ?? []).map((p) => String(p.user_id));
    if (ids.length) return db().from("paste_claims").delete().in("person_id", ids);
  });
  // The pins are seeded by a function of their own, so no other migration has to carry them (#764).
  await ok("no pinned dashboards", () => db().rpc("prototype_seed_pins"));
  await ok("no Snapshots", () => seedDemoSnapshots());
  // The finished period of the monthly close names a Snapshot, so it is seeded after the Snapshots are taken (spec 0045).
  await ok("no finished period in the close", () => db().rpc("prototype_seed_close"));
  // The Filled-in Values of the close (spec 0046): a Stand-in's while Away, and one the submitter later replaced.
  await ok("no Filled-in Values", () => db().rpc("prototype_seed_fill_in"));
  // How each Metric is calculated (spec 0060), after the history, which adds Metrics of its own.
  await ok("no Calculation Notes", () => db().rpc("prototype_seed_calculation_notes"));
  await ok("no Outbox", () => seedDemoOutbox());
  // Last, so it sees everything the steps above made: the seed's own rows and the showcase that visitors may not change (spec 0051).
  const showcase = await step("no showcase; visits stay refused until the next reset", () => db().rpc("prototype_seed_showcase"));
  if (whole && showcase && generation !== undefined) await markDemoSeedDone(generation);
  else console.error("Demo: the seed did not finish; the seed's end is not marked and the next call of the reset job resets again");
  return true;
}

/** Says the seed of this Generation is finished, by the database's clock: the rows the steps above wrote after the reset's
 * transaction (Snapshots, the close, the Outbox) are the seed's, and visitors' row caps must not count them. Until it is
 * said, a visitor's write to a capped table is refused as "starting fresh" (migration 20270126140000). Only the Generation
 * named is marked: a newer reset's seed is not finished by an older call (migration 20270131100000). */
export async function markDemoSeedDone(generation: number): Promise<void> {
  const { error } = await db().rpc("demo_seed_done", { p_generation: generation });
  if (error) console.error("Demo: the seed's end was not marked", error.message);
}

/** The demo's Outbox: what the morning's run sends, as its Owner would start it by hand. Never sent anywhere: the
 * demo's Deliveries stay in the Outbox (mail.ts, slack-send.ts, telegram-send.ts). A failure leaves it empty and is the reset's to log (`step`). */
async function seedDemoOutbox(): Promise<void> {
  const owner = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" as const };
  await seedingDemo(async () => {
    await askForMissingValues(owner);
    await sendDueReminders(owner);
  });
}
