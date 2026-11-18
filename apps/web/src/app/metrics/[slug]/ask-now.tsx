"use client";
// Ask me now (spec 0021): the Metric's current Prompt to its owner at once, on their own Connector.
import { useTransition } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { askMeNow } from "@/app/series-actions";
import { Button } from "@/components/ui/button";

/** The button, for a Metric's owner who also submits it; says where the Prompt went, or why it stayed in the Outbox. */
export function AskNow({ metricId }: { metricId: number }) {
  const [pending, start] = useTransition();
  const press = () => start(async () => {
    try {
      const r = await askMeNow(metricId);
      if ("error" in r) { toast.error(r.error); return; }
      if (r.state === "sent" || r.state === "queued") toast.success(`Asked by ${r.label}. Answer it there, or by the form link in it.`);
      else toast.message(`Kept in the Outbox: ${r.note ?? `${r.label} does not send for real here.`}`, { description: "Open the Outbox to see and answer it." });
    } catch (e) {
      toast.error((e as Error).message);
    }
  });
  return (
    <Button variant="outline" onClick={press} disabled={pending} title="Send yourself this period's request for the value now">
      <Send /> Ask me now
    </Button>
  );
}
