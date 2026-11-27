"use client";
// After a Pack's set-up: "Send your first number" and "Invite them" (spec 0068; GLOSSARY: Pack, Invitation, Contact,
// Guest, Self-check, Trial Workspace). Where a trial's invitations wait for the Owner's own value, the screen says so,
// takes the number, and then offers the invitations on the same spot; a number that is a colleague's says so before it
// is sent, and a value that waits for the person's own check has its button here. Nothing is sent before "Invite them"
// is pressed. It draws what the core answered to this Owner or Admin: names, roles, their own values and, once, the
// link of an invitation just made that was not emailed.
import { useId, useState } from "react";
import { answered, Panel, Reading, useShown } from "@/app/first-steps/closing-parts";
import { PHONE_ACTIONS, PHONE_BUTTON, PHONE_FIELD, PHONE_TEXT_LINK } from "@/app/setup/phone";
import { FullLoadLink } from "@/components/guided-frame";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionError } from "@/lib/action-error";
import type { PackCheck, PackInvite, PackInvited, PackInvitee } from "@ziffr/core/pack-after-invite";
import { cn } from "@/lib/utils";
import { Card, NOTE, TEXT_BUTTON, TEXT_FIELD, Tick } from "./parts";
import { namesWords } from "./providers";

/** What the panel asks the server. */
export type InviteActions = {
  read: () => Promise<PackInvite | ActionError>;
  send: (metricId: number, text: string) => Promise<{ ok: boolean; detail: string } | ActionError>;
  /** Confirms the person's own check of a value. */
  confirm: (actionId: number) => Promise<{ words: string } | ActionError>;
  invite: (personIds: string[]) => Promise<PackInvited[] | ActionError>;
};

type Props = {
  actions: InviteActions;
  /** Where providers are chosen, offered when no number can be typed yet. */
  providersHref: string;
  /** On a page of its own it also says when there is nothing to do. */
  alone?: boolean;
};

const ROLE = { member: "as a Member", guest: "as a Guest" } as const;
const STATE = { open: null, invited: "Invited already, and not joined yet.", noAddress: "No email address. Add one on the Members page." } as const;

/** The link of an invitation that was not emailed, to copy and send. */
function InviteLink({ link, name }: { link: string; name: string }) {
  const id = useId();
  const [said, setSaid] = useState<string | null>(null);
  const copy = () => {
    const manual = "Not copied. Select the link and copy it by hand.";
    if (!navigator.clipboard) return setSaid(manual);
    void navigator.clipboard.writeText(link).then(() => setSaid("Link copied."), () => setSaid(manual));
  };
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="sr-only">Invitation link for {name}</label>
      <Input id={id} readOnly value={link} className={TEXT_FIELD} onFocus={(e) => e.target.select()} />
      <Button type="button" variant="outline" className={TEXT_BUTTON} onClick={copy}>Copy the link<span className="sr-only"> for {name}</span></Button>
      <p role="status" className="text-muted-foreground empty:hidden">{said}</p>
    </div>
  );
}

/** The Owner's first number: which one, what it is, and "Record value". */
function FirstNumber({ first, send, onSent, providersHref }: { first: NonNullable<PackInvite["first"]>; send: InviteActions["send"]; onSent: (words: string) => Promise<void>; providersHref: string }) {
  const [picked, setPicked] = useState<number | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [select, value] = [useId(), useId()];
  if (!first.you) return <p className={NOTE}>An Owner of this Workspace sends the first number. Invitations open once it is in.</p>;
  const number = first.numbers.find((n) => n.id === picked) ?? first.numbers[0];
  if (!number) {
    return (
      <p className={NOTE}>
        None of these numbers takes a typed value from you here. {first.choose
          ? <><FullLoadLink href={providersHref} className={PHONE_TEXT_LINK}>Choose yourself as provider</FullLoadLink>, then type one here.</>
          : <>Record one value on the page of any number you send: <FullLoadLink href="/metrics" className={PHONE_TEXT_LINK}>your Metrics</FullLoadLink>. Invitations open once it is in.</>}
      </p>
    );
  }
  async function submit() {
    if (busy || !typed.trim()) return;
    setBusy(true);
    setRefusal(null);
    const r = await answered(() => send(number!.id, typed), setRefusal);
    if (r && !r.ok) setRefusal(r.detail);
    if (r?.ok) await onSent(r.detail);
    setBusy(false);
  }
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      {first.numbers.length > 1 && (
        <div>
          <label htmlFor={select} className="block text-sm font-medium">Which number</label>
          <select id={select} className={cn(PHONE_FIELD, "mt-1 block sm:w-full")} value={number.id} onChange={(e) => { setPicked(Number(e.target.value)); setRefusal(null); }}>
            {first.numbers.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        </div>
      )}
      <div>
        <label htmlFor={value} className="block text-sm font-medium break-words">{number.name}{number.unit ? ` (${number.unit})` : ""}, {number.period}</label>
        <Input id={value} className={TEXT_FIELD} inputMode="decimal" autoComplete="off" maxLength={40} value={typed} onChange={(e) => setTyped(e.target.value)} />
      </div>
      {number.whose && <p className={NOTE}>This will count as {number.whose}&rsquo;s number for {number.period}.</p>}
      <p role="alert" className="text-sm text-destructive empty:hidden">{refusal}</p>
      <Button type="submit" className={cn(PHONE_BUTTON, "sm:px-6")} disabled={busy || !typed.trim()}>{busy ? "Recording…" : "Record value"}</Button>
    </form>
  );
}

/** The person's values that wait for their own check, each with the button that confirms it. */
function Checks({ checks, confirm, onDone }: { checks: PackCheck[]; confirm: InviteActions["confirm"]; onDone: (words: string) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  async function press(actionId: number) {
    if (busy) return;
    setBusy(true);
    setRefusal(null);
    const r = await answered(() => confirm(actionId), setRefusal);
    if (r) await onDone(r.words);
    setBusy(false);
  }
  return (
    <>
      {checks.map((c) => (
        <Panel key={c.actionId}>
          <p className="font-medium">Waits for your check: {c.value}</p>
          <p>{c.metric}, {c.period}. Nobody else can approve it, so it counts as final once you confirm it.</p>
          <div className={PHONE_ACTIONS}>
            <Button type="button" className={cn(PHONE_BUTTON, "sm:px-6")} disabled={busy} onClick={() => void press(c.actionId)}>Yes, it is right<span className="sr-only">: {c.value} for {c.metric}</span></Button>
            <FullLoadLink href={`/actions/${c.actionId}`} className={PHONE_TEXT_LINK}>Correct it</FullLoadLink>
          </div>
        </Panel>
      ))}
      <p role="alert" className="text-sm text-destructive empty:hidden">{refusal}</p>
    </>
  );
}

// Ticked to begin with: those who can be invited now, up to the places left, in the order given (roles first).
const preselected = (people: PackInvitee[], places: number | null) => people.filter((p) => p.state === "open").slice(0, places ?? undefined).map((p) => p.id);

/** Whom to invite, each with their role, and what became of each invitation beside its person. */
function InviteList({ view, invite, reload }: { view: PackInvite; invite: InviteActions["invite"]; reload: () => Promise<void> }) {
  const [ticked, setTicked] = useState<string[] | null>(null);
  const [done, setDone] = useState<Record<string, PackInvited>>({});
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const heading = useId();
  const open = view.people.filter((p) => p.state === "open");
  const chosen = (ticked ?? preselected(view.people, view.places)).filter((id) => open.some((p) => p.id === id));
  async function press() {
    if (busy || !chosen.length) return;
    setBusy(true);
    setRefusal(null);
    const r = await answered(() => invite(chosen), setRefusal);
    if (r) {
      setDone((was) => ({ ...was, ...Object.fromEntries(r.map((x) => [x.id, x])) }));
      // Whoever was refused stays unticked, so a second press does not simply repeat it.
      setTicked([]);
      await reload();
    }
    setBusy(false);
  }
  return (
    <section aria-labelledby={heading} className="space-y-3">
      <div>
        <h2 id={heading} className="text-sm font-medium">Invite them</h2>
        <p className="text-sm text-muted-foreground">Nothing is sent until you press the button.{view.mail ? "" : " Email is not set up here: you get a link to send yourself."}</p>
      </div>
      {view.places !== null && open.length > view.places && <p className={NOTE}>Your trial has {view.places === 1 ? "1 place" : `${view.places} places`} left for people.</p>}
      <Card className="py-1 text-sm">
        <ul className="divide-y divide-border">
          {view.people.map((p) => {
            const became = done[p.id];
            return (
              <li key={p.id} className="space-y-1.5 py-0.5">
                {p.state === "open" && !(became && became.state !== "refused")
                  ? <Tick title={p.name} hint={`Invited ${ROLE[p.role]}`} checked={chosen.includes(p.id)} onChange={(on) => setTicked(on ? [...chosen, p.id] : chosen.filter((x) => x !== p.id))} />
                  : <p className="py-2.5 font-medium break-words">{p.name}</p>}
                {(became || STATE[p.state]) && <p role="status" className="pb-2 text-muted-foreground break-words">{became?.words ?? STATE[p.state]}</p>}
                {became?.link && <div className="pb-2"><InviteLink link={became.link} name={p.name} /></div>}
              </li>
            );
          })}
        </ul>
      </Card>
      <p role="alert" className="text-sm text-destructive empty:hidden">{refusal}</p>
      {open.length > 0 && <Button type="button" className={cn(PHONE_BUTTON, "sm:px-6")} disabled={busy || !chosen.length} onClick={() => void press()}>{busy ? "Inviting…" : "Invite them"}</Button>}
    </section>
  );
}

/** The first number where it is needed, then the invitations. */
export function InvitePanel({ actions, providersHref, alone }: Props) {
  const { data, failed, reload } = useShown(actions.read);
  const [sent, setSent] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const heading = useId();
  if (!data) return <Reading failed={failed} onRetry={() => void reload()} />;
  if (data.first) {
    const waiting = data.people.map((p) => p.name);
    return (
      <section aria-labelledby={heading} className="space-y-3">
        <div>
          <h2 id={heading} className="text-lg font-medium">Send your first number</h2>
          <p className="text-sm text-muted-foreground">Needed before colleagues can be emailed.{waiting.length > 0 ? ` Then you can invite ${namesWords(waiting)}.` : ""}</p>
        </div>
        <FirstNumber first={data.first} send={actions.send} providersHref={providersHref} onSent={async (words) => { setSent(words); await reload(); }} />
      </section>
    );
  }
  const list = !data.closed && data.people.length > 0;
  // Why nobody can be invited is said wherever there is someone to invite.
  const closed = data.closed && (data.people.length > 0 || alone) ? data.closed : null;
  if (!sent && !confirmed && !list && !closed && !data.checks.length && !alone) return null;
  return (
    <div className="space-y-4">
      {sent && !confirmed && <Panel role="status"><p className="font-medium">Your number is on record.</p><p>{sent}</p></Panel>}
      {confirmed && <Panel role="status"><p>{confirmed}</p></Panel>}
      <Checks checks={data.checks} confirm={actions.confirm} onDone={async (words) => { setConfirmed(words); await reload(); }} />
      {closed && <p className={NOTE}>{closed}</p>}
      {list && <InviteList view={data} invite={actions.invite} reload={reload} />}
      {!list && !data.closed && <p className={NOTE}>Nobody from this set-up is waiting for an invitation.</p>}
    </div>
  );
}
