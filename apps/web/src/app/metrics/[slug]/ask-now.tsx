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
    if (r.state === "sent" || r.state === "queued") toast.success(`Asked by ${r.label}. Answer it there, or by the form link in it.`);
    else toast.message(`Kept in the Outbox: ${r.note ?? `${r.label} does not send for real here.`}`, { description: "Open the Outbox to see and answer it." });
  } catch {
    toast.error(UNEXPECTED);
  }
}
