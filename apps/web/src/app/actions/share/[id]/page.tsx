import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { currentActor } from "@/lib/viewer";
import { getShareProposal, previewFingerprint, previewShareProposal } from "@ziffr/core/share-proposals";
import { PageHeader } from "@/components/page-header";
import { DashboardReader } from "@/components/dashboard-reader";
import { ShareProposalButtons } from "@/components/share-proposal-buttons";
import { ProposalFacts, proposalTitle } from "@/components/share-proposal-summary";

// Never cached: it shows what would go out right now, and only to the person it was prepared for.
export const dynamic = "force-dynamic";

/** Where a person looks at what an assistant prepared to share, and confirms or declines it (GLOSSARY: Share Proposal). */
export default async function ShareProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await currentActor();
  const id = Number((await params).id);
  // Only the person it was prepared for; anyone else, and anything missing, is the same "not found".
  const p = await getShareProposal(actor, id);
  if (!p) notFound();
  const preview = p.status === "open" ? await previewShareProposal(actor, id).catch(() => null) : null;
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/actions" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Actions</Link>
      <PageHeader title={proposalTitle(p)} sub="An assistant or program prepared this. Nothing is shared and nothing is sent until you confirm here." />
      <div className="stock space-y-4 rounded-[var(--radius-card)] p-5">
        <ProposalFacts p={p} />
        <ShareProposalButtons id={p.id} seen={previewFingerprint(preview)} closed={p.status === "open" ? null : p.status === "expired" ? "This proposal ran out after 7 days. Ask the assistant to prepare it again." : p.status === "confirmed" ? (p.emailState === "failed" ? "You confirmed this, but the email could not be sent." : "You confirmed this.") : "You declined this."} />
      </div>
      {p.status === "open" && p.kind === "view_link" && (
        <section className="mt-6">
          <h2 className="mb-2 text-sm font-semibold">What {p.recipient.label} will see</h2>
          {preview && preview.type === "dashboard" ? (
            <>
              <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-rule-2)] p-4">
                <DashboardReader dashboard={{ id: preview.id, name: preview.name, intro: preview.intro ?? "", theme_id: preview.themeId }} widgets={preview.widgets ?? []} data={preview.data} readOnly />
              </div>
              <p className="mt-2 text-xs text-muted-foreground">The same cards and numbers, read from top to bottom here. {preview.snapshot ? "" : "Nothing in it can be changed or asked from the link."}</p>
            </>
          ) : <p className="text-sm text-muted-foreground">There is nothing to show right now: you may no longer be able to share it. Confirming would be refused.</p>}
        </section>
      )}
    </div>
  );
}
