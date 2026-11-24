"use client";
// GLOSSARY: Setup Guide, Slide-over. The Setup Guide in the side panel (spec 0052, ticket 11): the viewer's steps with their
// ticks, the next one marked, Skip beside each, and Hide for the whole guide. It opens from the Setup line, from Help and from
// the person's menu through the one panel host (spec 0050). The steps come from the server when the panel opens (ids and
// ticks only, the viewer's own), so it is never stale after a Skip and carries nothing the viewer may not see. Each step
// opens its screen on the full page, which is the one place a step is done.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Circle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSlideOver } from "@/components/slide-over-host";
import { STEP_INFO } from "@/app/setup/step-info";
import { hideSetup, readSetupSteps, reopenSetup, skipStep, type SetupPanelData } from "@/app/setup/actions";
import { useOpenPanel, writePanel } from "@/lib/panel-param";
import type { SetupStepId } from "@ziffr/core/setup-steps";

/** What the layout tells the shell about the guide: whether it applies to the viewer (a Guest and the demo: no) and whether the Setup line is up. */
export type SetupState = { applies: boolean; shown: boolean };

const SetupContext = createContext<SetupState>({ applies: false, shown: false });

/** Gives Help and the menus to know whether to offer "Setup Guide" (the layout works it out on the server). */
export function SetupProvider({ value, children }: { value: SetupState; children: React.ReactNode }) {
  return <SetupContext.Provider value={value}>{children}</SetupContext.Provider>;
}

/** Whether the guide applies to the viewer and whether its line is shown now. */
export function useSetupState(): SetupState {
  return useContext(SetupContext);
}

const label = (id: string) => STEP_INFO[id as SetupStepId]?.label ?? id;

function SetupContent() {
  const panel = useSlideOver();
  const router = useRouter();
  const [data, setData] = useState<SetupPanelData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const list = useRef<HTMLOListElement>(null);

  const load = useCallback(async () => {
    const r = await readSetupSteps();
    if (r && "error" in r) setMessage(r.error);
    else setData(r);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const skip = (id: string) => start(async () => {
    const r = await skipStep(id);
    if (r && "error" in r) { setMessage(r.error); return; }
    await load();
    router.refresh();
    list.current?.focus();
  });
  const hide = () => start(async () => {
    const r = await hideSetup();
    if (r && "error" in r) { setMessage(r.error); return; }
    panel.close();
    router.refresh();
  });

  if (!data) return <p className="text-sm text-muted-foreground" role="status">{message ?? "Loading the steps…"}</p>;
  const done = data.steps.every((s) => s.ticked || s.skipped);
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p>{done ? "Everything here is done or skipped. You can open any step again." : `${data.steps.filter((s) => s.ticked || s.skipped).length} of ${data.total} done. Each step is optional, and you can skip any of them.`}</p>
      <ol ref={list} tabIndex={-1} aria-label="Setup steps" className="flex flex-col gap-1 outline-none">
        {data.steps.map((s) => (
          <li key={s.id} aria-current={s.next ? "step" : undefined} className={`flex items-center gap-2 rounded-[var(--radius-input)] border px-2 py-1.5 ${s.next ? "border-foreground/40 bg-card font-medium" : "border-transparent"}`}>
            {s.ticked ? <Check aria-hidden className="size-4 shrink-0 text-[var(--color-success)]" /> : s.next ? <ArrowRight aria-hidden className="size-4 shrink-0" /> : <Circle aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
            <Link href={`/setup?step=${s.id}`} onClick={() => panel.close()} className="min-w-0 flex-1 underline-offset-4 hover:underline">
              {label(s.id)}
              <span className="sr-only">{s.ticked ? ", done" : s.skipped ? ", skipped" : s.next ? ", next" : ", to do"}</span>
            </Link>
            {s.skipped && !s.ticked && <span className="text-xs text-muted-foreground">Skipped</span>}
            {!s.ticked && !s.skipped && <Button variant="ghost" size="sm" disabled={pending} onClick={() => skip(s.id)}>Skip<span className="sr-only"> {label(s.id)}</span></Button>}
          </li>
        ))}
      </ol>
      {message && <p role="alert" className="text-destructive">{message}</p>}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
        <Link href="/setup" onClick={() => panel.close()} className="underline underline-offset-4">Open the Setup Guide</Link>
        <Button variant="ghost" size="sm" disabled={pending} onClick={hide} className="ml-auto">Hide the Setup Guide</Button>
      </div>
      <p className="text-xs text-muted-foreground">Hiding puts the line away for you in this Workspace. Open the Setup Guide again from Help or your menu.</p>
    </div>
  );
}

/** Opens the guide in the side panel; with `reopen` it first clears the person's Hide (Help and the menu), so the Setup line comes back. */
export function useOpenSetup(): (reopen?: boolean) => void {
  const panel = useSlideOver();
  const router = useRouter();
  return useCallback((reopen = false) => {
    const show = () => panel.open({ title: "Setup Guide", description: "The steps that set up your Workspace, and where you are.", content: <SetupContent /> });
    if (!reopen) { show(); return; }
    void reopenSetup().then((r) => { if (!(r && "error" in r)) router.refresh(); show(); });
  }, [panel, router]);
}

/** Opens the guide once when the address says `?panel=setup`, then leaves the address clean; nothing opens for someone with no guide. */
export function SetupOpener() {
  const { applies } = useSetupState();
  const asked = useOpenPanel() === "setup";
  const open = useOpenSetup();
  const handled = useRef(false);
  useEffect(() => {
    if (!asked) { handled.current = false; return; }
    if (handled.current) return;
    handled.current = true;
    if (applies) open(false);
    writePanel(null);
  }, [asked, applies, open]);
  return null;
}

/** The Help contents entry and the menus' "Setup Guide": a button that reopens the guide for the person. */
export function SetupGuideButton({ className, children, onOpen }: { className?: string; children?: React.ReactNode; onOpen?: () => void }) {
  const open = useOpenSetup();
  const { applies } = useSetupState();
  const props = useMemo(() => ({ onClick: () => { onOpen?.(); open(true); } }), [open, onOpen]);
  if (!applies) return null;
  return <button type="button" className={className} aria-haspopup="dialog" {...props}>{children ?? "Setup Guide"}</button>;
}
