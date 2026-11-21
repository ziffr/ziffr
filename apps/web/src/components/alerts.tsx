"use client";
// Alerts in the app (GLOSSARY: Alert, Delivery Preference, Due Date; spec 0032, ticket #375): the form that makes or
// changes one, and the person's own Alerts with their state, pause, edit and delete. Used on a Metric's page ("Alert
// me…") and in Your settings. The core checks everything again; this only says in words what it will accept.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bell, Pause, Pencil, Play, Trash2 } from "lucide-react";
import { shown, unwrap } from "@/lib/action-error";
import { createAlert, deleteAlert, updateAlert } from "@/app/alert-actions";
import { conditionWords, DELIVERY_WORDS, standing } from "@/lib/alert-words";
import { ALERT_SHARE_MAX, ALERT_SHARE_MIN, type AlertCondition, type AlertKind } from "@ziffr/core/alert-rules";
import type { AlertChoices, AlertDelivery, MyAlert } from "@ziffr/core/alerts";
import { Button, buttonVariants } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { usePanel } from "@/lib/panel-param";

const field = "h-9 w-full rounded-[var(--radius-input)] border border-input bg-card px-2.5 text-sm";
const KIND_LABEL: Record<AlertKind, string> = {
  share_of_target: "Reaches a share of its target",
  at_or_above: "Reaches a value (at or above)",
  below: "Falls below a value",
  changed_more: "Changes more than a share against the period before",
  missing_after_due: "Has no value the day after its Due Date",
};
const KINDS = Object.keys(KIND_LABEL) as AlertKind[];

/** The number a condition holds, as text for the field. */
const numberOf = (c: AlertCondition | undefined): string => (!c ? "" : c.kind === "at_or_above" || c.kind === "below" ? c.value : c.kind === "share_of_target" || c.kind === "changed_more" ? c.share : "");

/** The form for one Alert: its condition, way of delivery and the option. Makes it, or changes `initial`. */
function AlertForm({ metricId, initial, choices, onDone }: { metricId: number; initial?: MyAlert; choices?: AlertChoices; onDone: () => void }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const unavailable = choices?.unavailable ?? {};
  const first = KINDS.find((k) => !unavailable[k]) ?? "at_or_above";
  const [kind, setKind] = useState<AlertKind>(initial?.condition.kind ?? first);
  const [num, setNum] = useState(numberOf(initial?.condition));
  const [delivery, setDelivery] = useState<AlertDelivery>(initial?.delivery ?? "usual");
  const [include, setInclude] = useState(initial?.includeUnapproved ?? false);
  const isShare = kind === "share_of_target" || kind === "changed_more";
  const condition = (): AlertCondition => (kind === "missing_after_due" ? { kind } : kind === "at_or_above" || kind === "below" ? { kind, value: num.trim() } : { kind, share: num.trim() });
  const save = () => start(async () => {
    try {
      unwrap(initial ? await updateAlert(initial.id, { condition: condition(), delivery, includeUnapproved: include }) : await createAlert({ metricId, condition: condition(), delivery, includeUnapproved: include }));
      toast.success(initial ? "Alert changed" : "Alert set", { description: "You will be told once each time it becomes true." });
      router.refresh();
      onDone();
    } catch (e) { toast.error("Not saved", { description: shown(e) }); }
  });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <div>
        <label htmlFor="alert-kind" className="text-sm font-medium">Tell me when this Metric</label>
        <select id="alert-kind" value={kind} onChange={(e) => setKind(e.target.value as AlertKind)} className={`mt-1 ${field}`}>
          {KINDS.map((k) => <option key={k} value={k} disabled={Boolean(unavailable[k])}>{KIND_LABEL[k]}</option>)}
        </select>
        {KINDS.filter((k) => unavailable[k]).map((k) => <p key={k} className="mt-1 text-xs text-muted-foreground">{unavailable[k]}</p>)}
      </div>
      {kind !== "missing_after_due" && (
        <div>
          <label htmlFor="alert-number" className="text-sm font-medium">{isShare ? `Share, in % (${ALERT_SHARE_MIN} to ${ALERT_SHARE_MAX})` : "Value"}</label>
          <Input id="alert-number" inputMode="decimal" value={num} onChange={(e) => setNum(e.target.value)} placeholder={isShare ? "80" : "10000"} className="mt-1 w-40" required />
        </div>
      )}
      <div>
        <label htmlFor="alert-delivery" className="text-sm font-medium">Tell me by</label>
        <select id="alert-delivery" value={delivery} onChange={(e) => setDelivery(e.target.value as AlertDelivery)} className={`mt-1 ${field}`}>
          {(Object.keys(DELIVERY_WORDS) as AlertDelivery[]).map((d) => <option key={d} value={d}>{DELIVERY_WORDS[d]}</option>)}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">&ldquo;My usual way&rdquo; follows your Delivery Preference.</p>
      </div>
      {kind !== "missing_after_due" && (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-ink)]" />
          <span>Include values not approved yet<span className="block text-xs text-muted-foreground">Off: you hear only about values that are published or approved.</span></span>
        </label>
      )}
      <Button type="submit" disabled={pending}>{pending ? "Saving…" : initial ? "Save the Alert" : "Set the Alert"}</Button>
    </form>
  );
}

/** The person's Alerts, each with its state, why it is paused, and Pause or Resume, Edit and Delete. With `showMetric`
 * (Your settings) each names its Metric. */
export function AlertRows({ alerts, showMetric, choices }: { alerts: MyAlert[]; showMetric?: boolean; choices?: AlertChoices }) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<number | null>(null);
  const router = useRouter();
  const run = (f: () => Promise<unknown>, ok: string) => start(async () => { try { unwrap(await f()); toast.success(ok); router.refresh(); } catch (e) { toast.error("Not done", { description: shown(e) }); } });
  return (
    <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border text-sm">
      {alerts.map((a) => (
        <li key={a.id} className="space-y-2 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <div className="min-w-0 flex-1">
              <p className="font-medium break-words">{showMetric ? <>{a.metric.name}: {conditionWords(a.condition).toLowerCase()}</> : conditionWords(a.condition)}</p>
              <p className="text-xs text-muted-foreground">By {DELIVERY_WORDS[a.delivery]}{a.includeUnapproved ? ", values not approved yet included" : ""}. {standing(a)}.</p>
            </div>
            <div className="flex gap-1">
              <button type="button" disabled={pending} aria-label={a.pausedByPerson ? "Resume the Alert" : "Pause the Alert"} onClick={() => run(() => updateAlert(a.id, { paused: !a.pausedByPerson }), a.pausedByPerson ? "Alert resumed" : "Alert paused")} className="flex size-8 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                {a.pausedByPerson ? <Play aria-hidden className="size-3.5" /> : <Pause aria-hidden className="size-3.5" />}
              </button>
              <button type="button" disabled={pending} aria-label="Edit the Alert" aria-expanded={editing === a.id} onClick={() => setEditing(editing === a.id ? null : a.id)} className="flex size-8 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><Pencil aria-hidden className="size-3.5" /></button>
              <button type="button" disabled={pending} aria-label="Delete the Alert" onClick={() => run(() => deleteAlert(a.id), "Alert deleted")} className="flex size-8 items-center justify-center rounded-[var(--radius-input)] text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"><Trash2 aria-hidden className="size-3.5" /></button>
            </div>
          </div>
          {editing === a.id && <div className="border-t border-border pt-3"><AlertForm metricId={a.metric.id} initial={a} choices={choices} onDone={() => setEditing(null)} /></div>}
        </li>
      ))}
    </ul>
  );
}

/** "Alert me…" on a Metric's page: a slide-over (`?panel=alert` is its direct URL) with the person's Alerts on this Metric, how near the limits they are,
 * and the form for another. Not shown in the demo, which is read-only. */
export function AlertMe({ metric, mine, choices, controlled }: { metric: { id: number; name: string }; mine: MyAlert[]; choices: AlertChoices; /** The page's ⋯ menu opens it: no button of its own. */ controlled?: boolean }) {
  const [open, setOpen] = usePanel("alert");
  const { held } = choices;
  const full = held.person >= held.perPerson || held.metric >= held.perMetric;
  const trigger = <><Bell aria-hidden /> Alert me…{mine.length > 0 && <span className="fig text-muted-foreground">{mine.length}</span>}</>;
  const body = (
    <>
      <p className="text-sm text-muted-foreground">Ziffr tells you once when this Metric&rsquo;s latest value meets the condition, and again only after it has been false in between. Only you are told, and only while you can see the Metric.</p>
      {mine.length > 0 && <AlertRows alerts={mine} choices={choices} />}
      <p className="text-xs text-muted-foreground" aria-live="polite">You hold {held.metric} of {held.perMetric} Alerts on this Metric and {held.person} of {held.perPerson} in this Workspace.</p>
      {choices.archived ? <p className="text-sm">This Metric is archived. Bring it back to set an Alert on it.</p> : full ? <p className="text-sm">You have reached a limit. Delete an Alert to make another.</p> : <AlertForm metricId={metric.id} choices={choices} onDone={() => setOpen(false)} />}
    </>
  );
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {!controlled && <SheetTrigger className={buttonVariants({ variant: "outline" })}>{trigger}</SheetTrigger>}
      <SheetContent>
        <SheetHeader><SheetTitle>Alert me about {metric.name}</SheetTitle></SheetHeader>
        <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">{body}</div>
      </SheetContent>
    </Sheet>
  );
}
