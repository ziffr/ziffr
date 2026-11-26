"use client";
// "Send to yourself" on the Connectors page of a Practice Workspace (spec 0063; GLOSSARY: Practice Workspace,
// Connector): its person switches email, Slack and Telegram on for themself, each by itself. The core decides who may
// and sends only to the one place recorded.
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { shown, unwrap } from "@/lib/action-error";
import { setPracticeWay } from "@/app/connector-actions";
import type { PracticeWayState } from "@ziffr/core/practice-ways";

const NAME = { email: "Email", slack: "Slack", telegram: "Telegram" } as const;

/** What is so for one way, in a sentence: never by colour alone. */
function standing(s: PracticeWayState): string {
  if (!s.on) return s.cannot ?? "Off: your messages stay in the Outbox.";
  if (s.way === "email") return `On: your own messages go to ${s.address}.`;
  if (s.account === "recorded") return `On: your own messages go to the ${NAME[s.way]} account you linked.`;
  if (s.account === "changed") return `On, but you linked another ${NAME[s.way]} account since, so nothing is sent. Switch it off and on to use the new one.`;
  return `On. Now ${s.way === "slack" ? "connect Slack below, then link your own account" : "turn Telegram on below, then connect your own Telegram"}.`;
}

/** The three ways and their switches. */
export function PracticePanel({ ways }: { ways: PracticeWayState[] }) {
  const [pending, start] = useTransition();
  const set = (s: PracticeWayState) => start(async () => {
    try {
      unwrap(await setPracticeWay(s.way, !s.on));
      toast.success(s.on ? `${NAME[s.way]} is off` : `${NAME[s.way]} is on`);
    } catch (err) {
      toast.error("Not done", { description: shown(err) });
    }
  });
  return (
    <section aria-labelledby="practice-ways-h" className="stock rounded-[var(--radius-card)] p-4 text-sm">
      <h2 id="practice-ways-h" className="text-[length:var(--text-lg)]">Send to yourself</h2>
      <p className="mt-2 max-w-prose text-muted-foreground">Nothing from a Practice Workspace reaches anyone but you, or an address you enter yourself. Switch on a way to get your own messages by it. Each is off until you switch it on, and off again after Start over. Messages to made-up people always stay in the Outbox.</p>
      <ul className="mt-3 divide-y divide-border border-t border-border">
        {ways.map((s) => (
          <li key={s.way} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <p className="min-w-0 flex-1 basis-60 [overflow-wrap:anywhere]"><strong className="font-medium">{NAME[s.way]}.</strong> {standing(s)}</p>
            <Button variant="outline" className="min-h-11 sm:min-h-8" disabled={pending || (!s.on && s.cannot !== null)} onClick={() => set(s)} aria-label={`${s.on ? "Switch off" : "Switch on"} ${NAME[s.way]} to yourself`}>{s.on ? "Switch off" : "Switch on"}</Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
