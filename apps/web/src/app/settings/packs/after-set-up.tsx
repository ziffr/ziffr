"use client";
// An installed Pack's ways on its card (spec 0068; GLOSSARY: Pack): set it up where nobody has, else finish it, open its
// dashboard, choose who provides the numbers, set the asked numbers for a new period, change who approves, invite the
// people of the set-up or check a number sent. What follows a set-up is shown only where the core offers it to this
// Owner or Admin; each way leads to a screen of its own, which checks again.
import { PHONE_LINK_BUTTON } from "@/app/setup/phone";
import { afterHref, type AfterTask } from "@/app/use-pack/paths";
import type { PackCard } from "@ziffr/core/pack-after-card";

type Props = {
  installId: number;
  name: string;
  /** Whether the Pack added anything to set up: a Dashboard, Deck or Workflow Template. */
  sets: boolean;
  /** What the core knows of its set-up, or null where there is no record of one. */
  card: PackCard | null;
};

type Way = [href: string, words: string];

function waysOf(installId: number, sets: boolean, card: PackCard | null): Way[] {
  const flow = `/use-pack/${installId}`;
  const first: Way[] = sets && !card?.setUp ? [[flow, "Set it up"]] : [];
  if (!card) return first;
  const after = (task: AfterTask, words: string): Way => [afterHref(installId, task), words];
  const finish: Way[] = card.finish === "you" ? [[flow, "Finish setting up"]] : [];
  const dashboard: Way[] = card.dashboard === null ? [] : [[`/dashboards/${card.dashboard}`, "Open dashboard"]];
  // With nobody left to invite, a number that waits for this person's own check still has its way there.
  const people: Way[] = card.invite ? [after("invite", "Invite the people from this set-up")] : card.check ? [after("invite", "Check your number")] : [];
  return [
    ...first,
    ...finish,
    ...dashboard,
    ...(card.providers ? [after("providers", "Choose who provides them")] : []),
    ...(card.numbers ? [after("targets", card.numbers)] : []),
    ...(card.approver ? [after("approver", "Change who approves")] : []),
    ...people,
  ];
}

/** The ways of one installed Pack. */
export function AfterSetUp({ installId, name, sets, card }: Props) {
  const ways = waysOf(installId, sets, card);
  const providers = card?.providers ?? 0;
  if (!ways.length && card?.finish !== "someone") return null;
  return (
    <div className="mt-3 space-y-2">
      {card?.finish === "someone" && <p className="text-muted-foreground">Someone else started setting this Pack up here. They can finish it.</p>}
      {providers > 0 && <p className="text-muted-foreground">Nobody provides {providers === 1 ? "one of its numbers" : `${providers} of its numbers`} yet.</p>}
      {ways.length > 0 && (
        // Plain links: the screens are drawn without the app around them, so each is loaded anew.
        <ul aria-label={`Ways for ${name}`} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {ways.map(([href, words]) => <li key={words}><a href={href} className={PHONE_LINK_BUTTON}>{words}</a></li>)}
        </ul>
      )}
    </div>
  );
}
