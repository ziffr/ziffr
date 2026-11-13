import { db } from "@/lib/db";
import { viewerId } from "@/lib/viewer";
import { getProfiles } from "@/lib/data";
import { readableActions } from "@/lib/access";
import { PageHeader } from "@/components/page-header";
import { ConnectorsScreen, type DeliveryRow, type PrefRow } from "./screen";

export default async function ConnectorsPage() {
  const [viewer, people, { data: prefs }, { data: deliveries }, { data: me }, { data: tokens }] = await Promise.all([
    viewerId(),
    getProfiles(),
    db.from("delivery_preferences").select("user_id, kind, connector"),
    db.from("deliveries").select("*, actions(kind, status, question), prompts(source, answered_at, submitter_id, metric_id)").order("id", { ascending: false }).limit(80),
    db.from("profiles").select("is_owner").eq("id", await viewerId()).single(),
    db.from("tokens").select("code, metric_id, submitter_id"),
  ]);
  // Deliveries about a thread the viewer may not read stay hidden.
  const readable = new Set((await readableActions(viewer)).map((a) => a.id));
  const visible = (deliveries ?? []).filter((d) => !d.action_id || readable.has(d.action_id));
  return (
    <>
      <PageHeader title="Connectors" sub="How Ziffr reaches people where they already work, and how their answers come back. Values arrive the same way." />
      <ConnectorsScreen viewer={viewer} isOwner={Boolean(me?.is_owner)} people={people} prefs={(prefs ?? []) as PrefRow[]} deliveries={visible as DeliveryRow[]} tokens={tokens ?? []} />
    </>
  );
}
