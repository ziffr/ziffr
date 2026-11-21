"use client";
// Ask me now (spec 0021): the Metric's current Prompt to its owner at once, on their own Connector. An entry of the
// Metric page's ⋯ menu; this is what pressing it does.
import { isActionError, UNEXPECTED } from "@/lib/action-error";
import { toast } from "sonner";
import { askMeNow } from "@/app/series-actions";

/** Asks for the Metric's Prompt now and says where it went, or why it stayed in the Outbox. */
export async function askNow(metricId: number): Promise<void> {
  try {
    const r = await askMeNow(metricId);
    if (isActionError(r)) { toast.error(r.error); return; }
    // Where it went, and when that is not the way the person chose, that the Metric's Sources decided.
    const reason = r.chosen ? "" : " That is not your usual way: this Metric does not take values that way, or it does not reach you.";
    if (r.state === "sent" || r.state === "queued") toast.success(`Sent to you ${r.connector === "email" ? "by email" : `on ${r.label}`}.${reason}`);
    else toast.message(r.note?.startsWith("Not sent:") ? `${r.note} It waits in the Outbox.` : `Kept in the Outbox: ${r.note ?? `${r.label} does not send for real here.`}`, { description: "Open the Outbox to see and answer it." });
  } catch {
    toast.error(UNEXPECTED);
  }
}
