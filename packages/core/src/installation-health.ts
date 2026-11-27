// Installation Health (spec 0066; GLOSSARY: Installation Health, Installation Admin): whether the Installation does its
// own work, told from what Ziffr records anyway: the latest recorded run of each job that records one, and how many
// messages wait or failed. Counts and times only: no Workspace, person, message or error text. Nothing is asked of any
// other server.
import { db } from "./db";
import { assertInstallationAdmin, type InstallationActor } from "./installation-admins";

/** Minutes a message may be due before the page says that sending is behind: the job runs every five. */
export const SENDING_LATE_MINUTES = 30;

/** One background job: what it is, how often the clock calls it, what its latest record stands for, when that was (a
 * day for the usage figures) and, where it records failures, how many in 7 days. */
export type HealthJob = { id: string; name: string; every: string; recorded: string; at: string | null; day: string | null; failed: number | null };

/** What the Health page shows. `late` says that messages have been due for longer than the job's interval explains. */
export type InstallationHealth = {
  jobs: HealthJob[]; waiting: number; waitingSince: string | null; late: boolean;
  failed: { channel: string; day: number; week: number }[];
};

type Found = {
  workflows_at: string | null; workflows_failed_7d: number; deliveries_at: string | null; waiting: number; waiting_since: string | null;
  failed: { channel: string; day: number; week: number }[]; retention_at: string | null; retention_failed_7d: number; usage_day: string | null;
  keys_at: string | null; heads_ups_at: string | null; demo_at: string | null;
};

/** The Installation's health now. Installation Admins only. */
export async function installationHealth(actor: InstallationActor, now = new Date()): Promise<InstallationHealth> {
  await assertInstallationAdmin(actor);
  const { data, error } = await db().rpc("installation_health");
  if (error || !data) throw new Error("The Installation's health could not be read.");
  const f = data as Found;
  const job = (id: string, name: string, every: string, recorded: string, at: string | null, failed: number | null = null): HealthJob => ({ id, name, every, recorded, at, day: null, failed });
  return {
    jobs: [
      job("workflows", "Workflows: requests for values and reminders", "Every hour", "the latest scheduled run of a Workflow", f.workflows_at, Number(f.workflows_failed_7d)),
      job("deliveries", "Sending messages", "Every five minutes", "the latest message sent or tried", f.deliveries_at),
      job("keys", "Encrypting with Workspace Keys", "Every five minutes", "the latest Workspace it looked through", f.keys_at),
      job("heads-ups", "Heads-ups", "Every hour", "the latest Workspace it scanned", f.heads_ups_at),
      job("retention", "Retention", "Once a day", "the latest Metric it worked on", f.retention_at, Number(f.retention_failed_7d)),
      { ...job("usage", "Usage figures", "Once a day", "the latest day counted", null), day: f.usage_day },
      ...(f.demo_at ? [job("demo", "Demo reset", "Once a day, or after changes", "the latest fresh start of the demo", f.demo_at)] : []),
    ],
    waiting: Number(f.waiting), waitingSince: f.waiting_since,
    late: f.waiting_since !== null && now.getTime() - new Date(f.waiting_since).getTime() > SENDING_LATE_MINUTES * 60_000,
    failed: (f.failed ?? []).map((x) => ({ channel: String(x.channel), day: Number(x.day), week: Number(x.week) })),
  };
}
