"use client";
// The two ways to say a Heads-up is not wanted (GLOSSARY: Heads-up): Not useful (that Heads-up is not shown again) and Mute a
// Metric (none about it is shown). Each is the person's own; the core checks everything.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { shown, unwrap } from "@/lib/action-error";
import { markHeadsUpNotUseful, muteHeadsUpMetric } from "@/app/heads-up-actions";
import { Button } from "@/components/ui/button";

/** Not useful and one Mute button for each Metric of a Heads-up. `named` are Metrics the person sees. */
export function HeadsUpButtons({ headsUpKey, named, readOnly }: { headsUpKey: string; named: { id: number; name: string }[]; readOnly: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (work: () => Promise<unknown>, done: string) => start(async () => {
    try { unwrap(await work()); toast.success(done); router.refresh(); }
    catch (e) { toast.error("Not saved", { description: shown(e) }); }
  });
  if (readOnly) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => markHeadsUpNotUseful(headsUpKey), "Marked Not useful. It will not come back.")}>Not useful</Button>
      {named.map((m) => (
        <Button key={m.id} variant="outline" size="sm" disabled={pending} onClick={() => run(() => muteHeadsUpMetric(m.id), `Muted ${m.name}`)}>Mute {m.name}</Button>
      ))}
    </div>
  );
}
