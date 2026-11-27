// First Steps, "Who provides this number from now on?" (spec 0067; GLOSSARY: First Steps, Submitter, Contact,
// Invitation): yourself, a colleague, or nobody for now. Nothing is asked from here. A colleague who cannot be chosen yet
// is shown locked, with the way to open it. The colleague's address is held only while the screen is open.
import { useState } from "react";
import { Lock } from "lucide-react";
import type { FirstSenderView, ProviderChoice, ProvidersChosen } from "@ziffr/core/first-steps-providers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { answered, MAIN_BUTTON, Panel, Reading, useShown } from "../closing-parts";
import { Choice, Choices, ScreenHeading } from "../parts";
import { chooseProvider, readSender } from "../value-actions";
import type { ScreenProps } from "./types";

/** Choosing who sends the values. */
export function SenderScreen({ context, go }: ScreenProps) {
  const ws = context.workspace?.id ?? "";
  const { data, failed, reload } = useShown(() => readSender(ws));
  if (!data) {
    return (
      <>
        <ScreenHeading title="Who provides your numbers from now on?" />
        <Reading failed={failed} onRetry={() => void reload()} />
      </>
    );
  }
  return <Providers ws={ws} view={data} go={go} />;
}

// The lead names when Ziffr first asks.
function lead({ firstAsk, mailReal }: FirstSenderView): string {
  if (!firstAsk) return "Nothing is sent now.";
  return `Nothing is sent now. Ziffr first asks on ${firstAsk}${mailReal ? "" : ", and without email the request waits in the Outbox"}.`;
}

/** The choices as drawn from what the core handed over. */
export function Providers({ ws, view, go }: { ws: string; view: FirstSenderView; go: ScreenProps["go"] }) {
  const [colleague, setColleague] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [done, setDone] = useState<ProvidersChosen | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const other = view.alone ? "Someone else" : "A colleague";
  const title = view.several ? "Who provides these numbers from now on?" : "Who provides this number from now on?";

  async function choose(choice: ProviderChoice) {
    if (busy) return;
    setBusy(true);
    setRefusal(null);
    const r = await answered(() => chooseProvider(ws, { choice, ...(choice === "colleague" ? { email } : {}) }), setRefusal);
    setBusy(false);
    if (!r) return;
    // A colleague has something to read first, and in a trial maybe a link to send.
    if (r.lines.length) setDone(r);
    else go("done");
  }

  if (done) {
    return (
      <div className="space-y-4">
        <ScreenHeading key="chosen" title="Chosen">Nothing was asked yet.</ScreenHeading>
        <Panel role="status">{done.lines.map((line) => <p key={line}>{line}</p>)}</Panel>
        {done.link && (
          <div className="space-y-1.5">
            <label htmlFor="fs-link" className="block text-sm font-medium">The invitation link to send them</label>
            <Input id="fs-link" readOnly value={done.link} className="h-11 md:h-9" onFocus={(e) => e.target.select()} />
            <Button
              type="button" variant="outline" className="h-11 md:h-9"
              onClick={() => { const manual = "Not copied. Select the link and copy it by hand."; if (!navigator.clipboard) { setCopied(manual); return; } void navigator.clipboard.writeText(done.link!).then(() => setCopied("Link copied."), () => setCopied(manual)); }}
            >Copy the link</Button>
            <p role="status" className="text-sm text-muted-foreground empty:hidden">{copied}</p>
          </div>
        )}
        <Button type="button" className={MAIN_BUTTON} onClick={() => go("done")}>Go on</Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ScreenHeading title={title}>{lead(view)}</ScreenHeading>
      <Choices>
        <Choice title="I will" hint="Ziffr asks you" onPick={() => void choose("me")} />
        {view.locked ? (
          <Panel className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Lock aria-hidden className="size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 basis-40">
              <p className="font-medium">{other} (locked)</p>
              <p className="text-muted-foreground">Opens once your own first value is in.</p>
            </div>
            <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => go("value")}>Send it now</Button>
          </Panel>
        ) : (
          <Choice title={other} hint="Ziffr asks them" selected={colleague} onPick={() => { setRefusal(null); setColleague(!colleague); }} />
        )}
        {colleague && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void choose("colleague"); }}>
            <div className="space-y-1.5">
              <label htmlFor="fs-colleague" className="block text-sm font-medium">Their email address</label>
              <Input id="fs-colleague" type="email" autoComplete="off" autoFocus required maxLength={254} placeholder="name@company.com" value={email} className="h-11 md:h-9" onChange={(e) => setEmail(e.target.value)} />
              <p className="text-sm text-muted-foreground">
                {view.trial ? "Someone new here gets one invitation to join as a Guest, and is asked once they accept." : view.mailReal ? "Nobody is invited. Ziffr asks them for the number by email." : "Nobody is invited. The request waits in the Outbox."}
              </p>
            </div>
            <Button type="submit" className={MAIN_BUTTON} disabled={busy || !email.trim()}>{busy ? "Saving…" : "Continue"}</Button>
          </form>
        )}
        <Choice title="Nobody for now" hint="You enter values when you like" onPick={() => void choose("nobody")} />
      </Choices>
      <p role="alert" className="text-sm text-destructive empty:hidden">{refusal}</p>
    </div>
  );
}
