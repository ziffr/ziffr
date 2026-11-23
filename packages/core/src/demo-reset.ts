// Resetting the demo (ADR 0005, GLOSSARY: Demo Mode): the demo workspace emptied and seeded again in one locked step
// in the database, then what SQL cannot make: its Snapshots, whose values the core computes (spec 0013), and its
// Outbox, the morning's Prompts and reminders as the core sends them, so visitors find messages to answer in the
// simulators. Real workspaces are never touched. Visitors cannot change the demo (#271), so there is nothing of theirs
// to undo. The seed's dates follow the calendar it runs on (its history ends in the current month), so the job a public
// demo calls each night seeds it again and its periods keep reaching up to today. Docker's first start and
// `prototype:reset` seed it too, in SQL only.
import { db, seedingDemo } from "./db";
import { scanWorkspace } from "./heads-ups";
import { seedDemoSnapshots } from "./demo-snapshots";
import { askForMissingValues, sendDueReminders } from "./questions";
import { DEMO_WORKSPACE_ID } from "./team";

/** Resets the demo. False when it was reset less than a minute ago. */
export async function resetDemoWorkspace(): Promise<boolean> {
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
  return true;
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
