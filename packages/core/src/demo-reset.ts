// Resetting the demo (ADR 0005, GLOSSARY: Demo Mode): the demo workspace emptied and seeded again in one locked step
// in the database, then its Snapshots, which hold values SQL cannot compute (spec 0013). Real workspaces are never
// touched. Used by the reset button in the demo and by the scheduled job a public demo calls each night.
import { db } from "./db";
import { seedDemoSnapshots } from "./demo-snapshots";

/** Resets the demo. False when it was reset less than a minute ago: visitors share the demo and the database. */
export async function resetDemoWorkspace(): Promise<boolean> {
  const { data: done, error } = await db().rpc("demo_reset");
  if (error) throw new Error("The demo could not be reset. Try again in a minute.");
  if (!done) return false;
  await seedDemoSnapshots();
  return true;
}
