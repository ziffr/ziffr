// The Encryption section of the Installation Settings page (spec 0028, ticket #247; GLOSSARY: Workspace Key, Installation
// Admin): how far the re-encryption of Workspaces is, which key versions each Workspace has and whether any key is still
// wrapped under the previous Installation key. Counts and version numbers only: the page gets no key, wrapped or not,
// no value and no row.
import { RelativeTime } from "@/components/relative-time";
import { SEALED_LABELS as WHAT, type KeyProgress } from "@ziffr/core/workspace-key-progress";

const n = (x: number) => x.toLocaleString("en-US");

/** What is encrypted and how far the job is. */
export function EncryptionSection({ progress }: { progress: KeyProgress }) {
  const left = progress.columns.reduce((s, c) => s + c.plain, 0);
  const moving = progress.columns.reduce((s, c) => s + c.oldVersion, 0);
  const held = progress.columns.reduce((s, c) => s + c.heldBack, 0);
  const bad = progress.columns.reduce((s, c) => s + c.unopenable, 0);
  return (
    <section id="encryption" aria-labelledby="encryption-heading" className="scroll-mt-20 space-y-4">
      <h2 id="encryption-heading" className="text-lg font-medium">Encryption of Workspaces</h2>
      <p className="max-w-[62ch] text-sm text-muted-foreground">Every Workspace has a key of its own, kept only wrapped under this Installation&apos;s ZIFFR_SECRETS_KEY. A job seals what was written before, a little at a time. This page shows how far it is, never a key. Lose ZIFFR_SECRETS_KEY and every Workspace&apos;s encrypted data is lost with it: keep a copy apart from the database.</p>
      {!progress.encrypting ? (
        <p role="status" className="max-w-[62ch] text-sm">ZIFFR_SECRETS_KEY is not set, so nothing here is encrypted. Set it on the server and the job starts by itself.</p>
      ) : (
        <p role="status" className="text-sm">
          {progress.finished === progress.workspaces && progress.workspaces > 0 ? "Every Workspace is encrypted." : `${n(progress.finished)} of ${n(progress.workspaces)} Workspaces are fully encrypted.`}{" "}
          {n(progress.keyed)} {progress.keyed === 1 ? "has" : "have"} a key.
          {left > 0 && ` ${n(left)} values are still in clear.`}
          {moving > 0 && ` ${n(moving)} are moving to a newer key.`}
        </p>
      )}
      {held > 0 && <p className="max-w-[62ch] text-sm">{n(held)} {held === 1 ? "row was" : "rows were"} held back, such as two Contacts of one Workspace with the same address. Nothing is deleted; the Workspace&apos;s Owners can sort it out on their Team page.</p>}
      {bad > 0 && <p className="max-w-[62ch] text-sm">{n(bad)} sealed {bad === 1 ? "value does" : "values do"} not open (changed in the database, or moved from another place). The job leaves {bad === 1 ? "it" : "them"} alone.</p>}
      {progress.hasPreviousKey || progress.keysUnderPreviousKey > 0 ? (
        <p role="status" className="max-w-[62ch] text-sm">
          {progress.keysUnderPreviousKey === 0
            ? "No Workspace Key is wrapped under the previous Installation key any more: ZIFFR_SECRETS_KEY_PREVIOUS can go."
            : `${n(progress.keysUnderPreviousKey)} Workspace ${progress.keysUnderPreviousKey === 1 ? "Key is" : "Keys are"} still wrapped under the previous Installation key. Keep ZIFFR_SECRETS_KEY_PREVIOUS until none is.`}
        </p>
      ) : null}
      {progress.columns.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">Sealed values by kind</caption>
            <thead className="text-xs text-muted-foreground">
              <tr><th scope="col" className="py-1 pr-3 font-normal">What</th><th scope="col" className="py-1 pr-3 text-right font-normal">Values</th><th scope="col" className="py-1 pr-3 text-right font-normal">In clear</th><th scope="col" className="py-1 text-right font-normal">Workspaces done</th></tr>
            </thead>
            <tbody className="divide-y divide-border">
              {progress.columns.map((c) => (
                <tr key={`${c.table}.${c.column}`}>
                  <th scope="row" className="py-1.5 pr-3 font-normal">{WHAT[`${c.table}.${c.column}`] ?? `${c.table} ${c.column}`}</th>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{n(c.total)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{n(c.plain)}</td>
                  <td className="py-1.5 text-right tabular-nums">{n(c.workspacesDone)} of {n(c.workspaces)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {progress.listed.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Workspaces</h3>
          <ul className="divide-y divide-border rounded-[var(--radius-card,0.5rem)] border border-border text-sm">
            {progress.listed.map((w) => (
              <li key={w.workspaceId} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                <span className="font-medium">{w.name}</span>
                <span className="text-muted-foreground">
                  {w.versions.length ? `Key version ${w.versions.map((v) => `${v.version}${v.current ? "" : " (retired)"}`).join(", ")}` : "No key yet"}
                  {w.versions.some((v) => v.wrappedUnderPrevious) ? ", wrapped under the previous Installation key" : ""}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {w.columns === 0 ? "Not looked at yet" : w.columnsDone === w.columns ? "Encrypted" : `${n(w.plain)} values in clear`}
                  {w.checkedAt ? <> · <RelativeTime at={w.checkedAt} /></> : null}
                </span>
              </li>
            ))}
          </ul>
          {progress.workspaces > progress.listed.length && <p className="text-xs text-muted-foreground">The {n(progress.listed.length)} Workspaces that need most attention; {n(progress.workspaces - progress.listed.length)} more are encrypted.</p>}
        </div>
      )}
    </section>
  );
}
