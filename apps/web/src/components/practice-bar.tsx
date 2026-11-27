// The line above every screen of a Practice Workspace (spec 0063; GLOSSARY: Practice Workspace), so nobody takes its
// made-up numbers for real ones or waits for a message that will not come.
import Link from "next/link";
import { FullLoadLink } from "./guided-frame";

/** The words, and for an Installation Admin the way to a fresh one (`startOver`, its address; else null). `fullLoad`
 * is for a screen drawn without the app around it: its links then load the page anew, so the app is drawn there. */
export function PracticeBar({ startOver, fullLoad }: { startOver: string | null; fullLoad?: boolean }) {
  const To = fullLoad ? FullLoadLink : Link;
  return (
    <p className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 px-4 pt-3 text-xs text-muted-foreground sm:px-6">
      <span><strong className="font-medium text-foreground">Practice Workspace.</strong> Made-up numbers and people. Nothing reaches anyone but you or an address you entered.</span>
      <To href="/connectors" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground sm:min-h-0">Send to yourself</To>
      <To href="/connectors/outbox" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground sm:min-h-0">Outbox</To>
      {startOver && <To href={startOver} className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground sm:min-h-0">Start over</To>}
    </p>
  );
}
