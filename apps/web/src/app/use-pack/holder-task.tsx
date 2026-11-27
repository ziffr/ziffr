"use client";
// "Change who approves", after a Pack's set-up (spec 0068; GLOSSARY: Pack, Position, Approver, Share, Stand-in,
// Snapshot): pick the Position and the Member, read what will change, tick what to share, then make it. It draws what
// the core answered to this Owner or Admin; the server works the change out again.
import { useId, useState } from "react";
import { answered } from "@/app/first-steps/closing-parts";
import { ScreenHeading } from "@/app/first-steps/parts";
import { PHONE_BUTTON, PHONE_FIELD } from "@/app/setup/phone";
import { Button, buttonVariants } from "@/components/ui/button";
import type { ActionError } from "@/lib/action-error";
import type { PackHolderPick, PackHolderPlan, PackHolders } from "@ziffr/core/pack-after-holder";
import { cn } from "@/lib/utils";
import { Card, Lines, NOTE, StepForm, TEXT_BUTTON, Tick } from "./parts";

/** What the screen asks the server. */
type HolderActions = {
  plan: (pick: PackHolderPick) => Promise<PackHolderPlan | ActionError>;
  change: (input: PackHolderPick & { shares: string[]; mark: string }) => Promise<{ changed: string[]; byHand: string[] } | ActionError>;
};

type Props = { view: PackHolders; actions: HolderActions; done: string };

const titleOf = (p: PackHolders["positions"][number]) => (p.line ? `${p.name}, ${p.line}` : p.name);
const nowWords = (p: PackHolders["positions"][number]) => {
  const now = p.holders.length ? `Now: ${p.holders.join(", ")}.` : "";
  return p.heldFor ? `${now} Held for ${p.heldFor} until they have joined.` : now;
};

/** Which Position, and who takes it. */
function Pick({ view, position, person, onPosition, onPerson }: { view: PackHolders; position: number; person: string; onPosition: (i: number) => void; onPerson: (id: string) => void }) {
  const [one, two] = [useId(), useId()];
  const at = view.positions[position];
  return (
    <Card className="space-y-3">
      {view.positions.length > 1 && (
        <div>
          <label htmlFor={one} className="block text-sm font-medium">Position</label>
          <select id={one} className={cn(PHONE_FIELD, "mt-1 block sm:w-full")} value={position} onChange={(e) => onPosition(Number(e.target.value))}>
            {view.positions.map((p, i) => <option key={i} value={i}>{titleOf(p)}</option>)}
          </select>
        </div>
      )}
      <p className="text-sm break-words"><span className="font-medium">{titleOf(at)}.</span> {nowWords(at)}</p>
      <div>
        <label htmlFor={two} className="block text-sm font-medium">Who takes it</label>
        <select id={two} className={cn(PHONE_FIELD, "mt-1 block sm:w-full")} value={person} onChange={(e) => onPerson(e.target.value)}>
          <option value="">Pick a Member</option>
          {view.members.map((m) => <option key={m.id} value={m.id}>{m.you ? `Me (${m.name})` : m.name}</option>)}
        </select>
      </div>
    </Card>
  );
}

/** The change, from choosing to done. */
export function HolderTask({ view, actions, done }: Props) {
  const [position, setPosition] = useState(0);
  const [person, setPerson] = useState("");
  const [seen, setSeen] = useState<{ pick: PackHolderPick; plan: PackHolderPlan } | null>(null);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ changed: string[]; byHand: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const back = <a href={done} className={cn(buttonVariants({ variant: "outline" }), PHONE_BUTTON)}>Back to Packs</a>;
  const alert = <p role="alert" className="text-sm text-destructive empty:hidden">{refusal}</p>;

  async function act(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setRefusal(null);
    await work();
    setBusy(false);
  }
  const look = (pick: PackHolderPick) => act(async () => {
    const plan = await answered(() => actions.plan(pick), setRefusal);
    if (plan) { setSeen({ pick, plan }); setTicks({}); window.scrollTo(0, 0); }
  });

  if (result) {
    return (
      <>
        <ScreenHeading key="changed" title="Changed">Nothing was sent just now.</ScreenHeading>
        <div className="space-y-5">
          <Lines title="What changed" items={result.changed} />
          <Lines title="Left to do by hand" items={result.byHand} />
          {back}
        </div>
      </>
    );
  }
  if (!view.positions.length) {
    return (
      <>
        <ScreenHeading title="Nothing to change">Nothing of this Pack here has an Approver you may change.</ScreenHeading>
        {back}
      </>
    );
  }
  if (!seen) {
    const at = view.positions[position];
    return (
      <>
        <ScreenHeading key="pick" title="Change who approves">You see what changes before anything happens.</ScreenHeading>
        <StepForm problem={busy ? "Looking…" : person ? null : "Pick who takes it."} label="See what changes" onContinue={() => void look({ position: at.position, line: at.line, person })}>
          <Pick view={view} position={position} person={person} onPosition={setPosition} onPerson={setPerson} />
          {alert}
        </StepForm>
      </>
    );
  }
  const { plan, pick } = seen;
  const ticked = plan.shares.filter((s) => ticks[s.id] ?? s.suggested).map((s) => s.id);
  const nothing = !plan.changes.length && !ticked.length;
  const make = () => act(async () => {
    const r = await answered(() => actions.change({ ...pick, shares: ticked, mark: plan.mark }), setRefusal);
    if (r) { setResult(r); window.scrollTo(0, 0); }
  });
  return (
    <>
      <ScreenHeading key="plan" title="What will change">Nothing happens before you press the button.</ScreenHeading>
      <StepForm
        problem={busy ? "Changing…" : plan.problem ?? (nothing ? "Tick what to share, or go back." : null)} label="Make these changes" onContinue={() => void make()}
        aside={<Button type="button" variant="ghost" className={TEXT_BUTTON} onClick={() => { setSeen(null); setRefusal(null); }}>Pick again</Button>}
      >
        <Lines title="Changes" items={plan.changes} />
        {plan.shares.length > 0 && (
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium text-muted-foreground">Share with them</legend>
            <Card className="divide-y divide-border py-1">
              {plan.shares.map((s) => (
                <Tick key={s.id} title={s.words} hint={s.showsMore ? "This shows them more than they send themselves." : undefined} checked={ticks[s.id] ?? s.suggested} onChange={(on) => setTicks({ ...ticks, [s.id]: on })} />
              ))}
            </Card>
          </fieldset>
        )}
        {plan.notes.map((n) => <p key={n} className={NOTE}>{n}</p>)}
        <Lines title="Left to do by hand" items={plan.byHand} />
        {alert}
      </StepForm>
    </>
  );
}
