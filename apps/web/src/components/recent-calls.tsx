// The Access Log of one Access Key or Feed Key (GLOSSARY: Access Log): its recent calls, folded away under a summary.
import type { AccessLogEntry } from "@ziffr/core/access-log";

/** A call's time as the key lists show it, such as "19 Nov 2026, 14:05". */
export const callTime = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** A key's recent calls, newest first, when and what each was and how it ended; "No calls yet" without any. */
export function RecentCalls({ calls }: { calls: AccessLogEntry[] | undefined }) {
  return (
    <details className="w-full text-xs">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{calls?.length ? `Recent calls (last ${callTime(calls[0].at)})` : "No calls yet"}</summary>
      {!!calls?.length && (
        <table className="mt-2 w-full max-w-xl">
          <thead className="text-left text-muted-foreground"><tr><th className="font-normal">When</th><th className="font-normal">Call</th><th className="font-normal">Result</th></tr></thead>
          <tbody>
            {calls.map((c, i) => (
              <tr key={i}><td className="pr-3">{callTime(c.at)}</td><td className="pr-3 font-mono">{c.method} {c.route}</td><td className={c.status >= 400 ? "text-destructive" : undefined}>{c.status}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </details>
  );
}
