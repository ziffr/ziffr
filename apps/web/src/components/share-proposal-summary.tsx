// What a Share Proposal asks, in plain text (GLOSSARY: Share Proposal): the recipient and the message are shown exactly as
// they would go out, never as links or markup, because words in a Thread could have steered the assistant that wrote them.
import { formatDate } from "@ziffr/core/format";
import type { ShareProposal } from "@ziffr/core/share-proposals";

/** The question as a sentence, for a list. */
export function proposalTitle(p: ShareProposal): string {
  const what = `“${p.dashboard.name}”${p.snapshot ? `, Snapshot ${p.snapshot.label}` : ""}`;
  return p.kind === "view_link" ? `Share ${what} with ${p.recipient.label} as a View Link until ${formatDate(p.endsOn ?? "")}?` : `Share ${what} with ${p.recipient.label} in Ziffr, to look at?`;
}

/** The facts of a proposal as a list, with the message in a quote. */
export function ProposalFacts({ p }: { p: ShareProposal }) {
  return (
    <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
      <dt className="text-muted-foreground">Dashboard</dt><dd className="break-words">{p.dashboard.name}{p.snapshot ? `, Snapshot ${p.snapshot.label}` : ""}</dd>
      <dt className="text-muted-foreground">{p.kind === "view_link" ? "Emailed to" : p.recipient.type === "group" ? "Group" : "Person"}</dt><dd className="break-all font-medium">{p.recipient.label}</dd>
      <dt className="text-muted-foreground">How</dt>
      <dd>{p.kind === "view_link" ? `View Link, no sign-in needed, ${p.snapshot || p.frozen ? "the numbers as they are when you confirm" : "live numbers"}, works until ${formatDate(p.endsOn ?? "")}` : "A Share as Viewer: they can look, not change or ask"}</dd>
      {p.message && (<><dt className="text-muted-foreground">Message</dt><dd className="whitespace-pre-wrap break-words rounded-[var(--radius-input)] border border-border bg-[var(--color-paper-2)] p-2">{p.message}</dd></>)}
      <dt className="text-muted-foreground">Prepared by</dt><dd>{p.proposedBy ?? "an assistant or program that is no longer connected"}</dd>
      <dt className="text-muted-foreground">Can be confirmed until</dt><dd>{formatDate(p.expiresAt)}</dd>
    </dl>
  );
}
