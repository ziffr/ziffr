// The line above every screen of a Practice Workspace (spec 0063; GLOSSARY: Practice Workspace), so nobody takes its
// made-up numbers for real ones or waits for a message that will not come.
import Link from "next/link";

/** The words, and for an Installation Admin the way to a fresh one (`startOver`, its address; else null). */
export function PracticeBar({ startOver }: { startOver: string | null }) {
  return (
    <p className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 px-4 pt-3 text-xs text-muted-foreground sm:px-6">
      <span><strong className="font-medium text-foreground">Practice Workspace.</strong> Made-up numbers and people. Nothing reaches anyone but you or an address you entered.</span>
      <Link href="/connectors" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground sm:min-h-0">Send to yourself</Link>
      <Link href="/connectors/outbox" className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground sm:min-h-0">Outbox</Link>
      {startOver && <Link href={startOver} className="inline-flex min-h-11 items-center underline underline-offset-2 hover:text-foreground sm:min-h-0">Start over</Link>}
    </p>
  );
}
