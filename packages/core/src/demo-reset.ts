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

/** The demo's state: its Generation (moved by every reset, in the database), whether a visitor changed it since, and when it was last reset. Null when the row is not there. */
export async function readDemoState(): Promise<DemoState | null> {
  const { data, error } = await db().from("demo_state").select("generation, changed_since_reset, last_change_at, reset_at").maybeSingle();
  if (error) throw new Error("The demo's state could not be read.");
  if (!data) return null;
  const date = (v: string | null) => (v ? new Date(v) : null);
  return { generation: Number(data.generation), changedSinceReset: Boolean(data.changed_since_reset), lastChangeAt: date(data.last_change_at), resetAt: date(data.reset_at) };
}

/** Tells the database whether this Installation lets visitors change its demo (the setting in effect, which only the core can read). The database refuses a visit's write unless this is on, so it is set on every call of the reset job and off by default. */
async function setOpenToVisitors(on: boolean): Promise<void> {
  const { error } = await db().from("demo_state").update({ open_to_visitors: on }).eq("id", true);
  if (error) throw new Error("The demo's state could not be changed.");
}

/** Resets the demo. False when it was reset less than a minute ago, or, with `onlyWhenNeeded` (where visitors may change the demo), when nothing changed since its last reset and it is still young. */
export async function resetDemoWorkspace(opts: { onlyWhenNeeded?: boolean; openToVisitors?: boolean } = {}): Promise<boolean> {
  // First, so a switched-off setting closes the door at the next call (the clock makes one every 15 minutes) before any work.
  await setOpenToVisitors(opts.openToVisitors === true);
  if (opts.onlyWhenNeeded && !shouldResetDemo({ changesInEffect: true, state: await readDemoState(), now: new Date() })) return false;
  const { data: done, error } = await db().rpc("demo_reset");
  if (error) throw new Error("The demo could not be reset. Try again in a minute.");
  if (!done) return false;
  // The three years of history are seeded by a function of their own (#987), before anything that reads the values: the Snapshots, the close.
  const history = await db().rpc("prototype_seed_history");
  if (history.error) console.error("Demo: no three years of history", history.error.message);
  // The Heads-up job never scans the demo, so the pairs that move together are looked at here, once a night, as the job would look at a Workspace.
  try {
    await seedingDemo(() => scanWorkspace(DEMO_WORKSPACE_ID, new Date().toISOString()));
  } catch (e) {
    console.error("Demo: no Heads-ups", e instanceof Error ? e.message : e);
  }
  // The visits' counts belong to the window that just ended (spec 0051); a new window starts at zero.
  // A failure is logged and the reset carries on, as for the steps below: the counts are not worth a half-seeded demo.
  try { await clearDemoVisitCounts(); } catch (e) { console.error("Demo: visit counts not emptied", e instanceof Error ? e.message : e); }
  // The pins are seeded by a function of their own, so no other migration has to carry them (#764).
  const pins = await db().rpc("prototype_seed_pins");
  if (pins.error) console.error("Demo: no pinned dashboards", pins.error.message);
  await seedDemoSnapshots();
  // The finished period of the monthly close names a Snapshot, so it is seeded after the Snapshots are taken (spec 0045).
  const close = await db().rpc("prototype_seed_close");
  if (close.error) console.error("Demo: no finished period in the close", close.error.message);
  // The Filled-in Values of the close (spec 0046): a Stand-in's while Away, and one the submitter later replaced.
  const filledIn = await db().rpc("prototype_seed_fill_in");
  if (filledIn.error) console.error("Demo: no Filled-in Values", filledIn.error.message);
  await seedDemoOutbox();
  // Last, so it sees everything the steps above made: the seed's own rows and the showcase that visitors may not change (spec 0051).
  const showcase = await db().rpc("prototype_seed_showcase");
  if (showcase.error) console.error("Demo: no showcase; visits stay refused until the next reset", showcase.error.message);
  await markDemoSeedDone();
  return true;
}

/** Says the seed of this Generation is finished, by the database's clock: the rows the steps above wrote after the reset's
 * transaction (Snapshots, the close, the Outbox) are the seed's, and visitors' row caps must not count them. Until it is
 * said, a visitor's write to a capped table is refused as "starting fresh" (migration 20270126140000). */
export async function markDemoSeedDone(): Promise<void> {
  const { error } = await db().rpc("demo_seed_done");
  if (error) console.error("Demo: the seed's end was not marked", error.message);
}

/** The demo's Outbox: what the morning's run sends, as its Owner would start it by hand. Never sent anywhere: the
 * demo's Deliveries stay in the Outbox (mail.ts, slack-send.ts, telegram-send.ts). A failure leaves it empty. */
async function seedDemoOutbox(): Promise<void> {
  const owner = { personId: "sara", workspaceId: DEMO_WORKSPACE_ID, role: "owner" as const };
  try {
    await seedingDemo(async () => {
      await askForMissingValues(owner);
      await sendDueReminders(owner);
    });
  } catch (e) {
    console.error("Demo: no Outbox", e instanceof Error ? e.message : e);
  }
}
