// Share Proposals for assistants and programs (ticket #538, GLOSSARY: Share Proposal, Access Key). A key with
// shares:propose and dashboards:read prepares a share of a dashboard its creator owns; it never carries it out. The
// creator confirms or declines in Ziffr with their own sign-in (share-proposals.ts), and no key can, whatever scopes it
// holds. The answer carries only what the key may read anyway (the dashboard as get_dashboard shows it) and the words
// the creator will be asked about: no values, so a proposal tells the assistant nothing it could not read.
import { assertScope, Forbidden, type Actor, type KeyActor } from "./actor";
import { getDashboardWithKey, type ApiDashboard } from "./api-dashboards";
import { issuer } from "./assistant-connections";
import { createShareProposal, getShareProposal, proposalPath, type ProposalInput } from "./share-proposals";

/** A Share Proposal as the key that made it sees it: what it asks, in plain words, and where the person confirms it. */
export type ApiShareProposal = {
  id: number;
  status: "open";
  how: "view_link" | "share";
  dashboard: { id: number; name: string };
  recipient: string;
  /** The last day a View Link works, or null for a Share. */
  ends: string | null;
  message: string | null;
  /** Whether a View Link shows the numbers live; false when they are kept as they are when it is made. */
  live: boolean;
  /** When it can no longer be confirmed. */
  expires: string;
  /** The page where the person confirms or declines; confirming is never possible through a key. */
  url: string;
  /** The dashboard as the key reads it: its introduction and widgets, for a preview. */
  preview: ApiDashboard;
};

const creatorOf = (actor: KeyActor): Actor => ({ personId: actor.personId, workspaceId: actor.workspaceId, role: actor.role });

/** Prepares a share for the key's creator to confirm (scopes shares:propose and dashboards:read). Refuses what the creator
 * may not share themselves, like a dashboard that is not theirs (Forbidden: "not found"), and words for the rest (Refused). */
export async function proposeShareWithKey(actor: KeyActor, input: ProposalInput): Promise<ApiShareProposal> {
  assertScope(actor, "shares:propose");
  assertScope(actor, "dashboards:read");
  const { id } = await createShareProposal(creatorOf(actor), Number(actor.key.id), input);
  const p = await getShareProposal(creatorOf(actor), id);
  if (!p) throw new Forbidden();
  return {
    id, status: "open", how: p.kind, dashboard: p.dashboard, recipient: p.recipient.label, ends: p.endsOn, message: p.message,
    live: p.kind === "view_link" && !p.frozen, expires: p.expiresAt, url: `${issuer()}${proposalPath(id)}`, preview: await getDashboardWithKey(actor, p.dashboard.id),
  };
}
