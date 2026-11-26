// The Connector cards of Workspace → Connectors → Channels (GLOSSARY: Connector): what each can do and whether it
// really goes out (spec 0021). Installation Admins get a link to where a missing one is set up (#532).
import Link from "next/link";
import { CheckCircle2, Mail, MessageCircle, MessageSquare, Send, Ticket } from "lucide-react";
import { CAPABILITY_LABEL, CONNECTORS, CONNECTOR_IDS, type ConnectorId } from "@ziffr/core/connectors/index";
import { WayLine } from "@/components/way-state";
import type { WayState } from "@ziffr/core/what-works-here";

export const ICON: Record<ConnectorId, typeof Mail> = { slack: MessageSquare, email: Mail, telegram: Send, whatsapp: MessageCircle, tickets: Ticket };

/** One card per Connector. `email`, `slack` and `telegram` say whether it really sends (spec 0004, 0007); `installationAdmin`
 * adds the link to Installation settings on a card whose way is not real. */
export function ChannelCards({ demo, email, slack, telegram, ways, installationAdmin }: { demo: boolean; email: "off" | "send" | "both"; slack: "off" | "connected"; telegram: "off" | "on"; ways: WayState[]; installationAdmin: boolean }) {
  return (
    <section aria-labelledby="c-h">
      <h2 id="c-h" className="mb-3 text-[length:var(--text-lg)]">Connected systems</h2>
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {CONNECTOR_IDS.map((id) => {
        const c = CONNECTORS[id];
        const Icon = ICON[id];
        return (
          <li key={id} className="stock rounded-[var(--radius-card)] p-4 text-sm">
            <div className="flex items-center gap-2 font-semibold"><Icon aria-hidden className="size-4" /> {c.label}</div>
            <p className="mt-1 text-muted-foreground">{c.blurb}</p>
            <ul className="mt-3 space-y-0.5 text-xs">
              {c.capabilities.map((k) => <li key={k} className="flex items-center gap-1.5"><CheckCircle2 aria-hidden className="size-3.5 text-[var(--color-success)]" /> {CAPABILITY_LABEL[k]}</li>)}
            </ul>
            {c.sourceId && demo && <Link href="/connectors/sources" aria-label={`Try sending a value by ${c.label}`} className="mt-3 inline-block text-xs underline max-sm:mt-1 max-sm:flex max-sm:min-h-11 max-sm:items-center">Try sending a value</Link>}
            {/* Real, simulated or off, from the core's whatWorksHere (spec 0021), so it says what the queue does. */}
            {ways.find((w) => w.way === id) ? <WayLine way={ways.find((w) => w.way === id)!} className="mt-3" /> : (
              <p className="mt-3 text-xs text-muted-foreground">{id === "email" && email !== "off" ? (email === "both" ? "Sends real email; replies come back." : "Sends real email; answers are given in Ziffr.") : id === "slack" && slack === "connected" ? "Sends real direct messages; answers in the thread come back." : id === "telegram" && telegram === "on" ? "Sends real messages to everyone who connected their Telegram; replies come back." : demo ? "Played in the demo: answer in the Outbox as the recipient." : "Not connected yet. Ziffr keeps what it would send in the Outbox."}</p>
            )}
            {installationAdmin && (id === "email" || id === "slack" || id === "telegram") && ways.find((w) => w.way === id)?.state === "simulated" && <Link href="/installation" className="mt-2 inline-flex min-h-8 items-center text-xs underline">Set it up on Installation settings</Link>}
          </li>
        );
      })}
    </ul>
    </section>
  );
}
