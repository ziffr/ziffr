import { db } from "@/lib/db";
import { currentWorkspaceId, viewerId } from "@/lib/viewer";
import { getProfiles } from "@/lib/data";
import { readableActions } from "@/lib/access";
import { isDemo } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ConnectorsScreen, type DeliveryRow, type PrefRow } from "./screen";

export default async function ConnectorsPage() {
  const ws = await currentWorkspaceId();
  const demo = await isDemo();
  const [viewer, people, { data: prefs }, { data: deliveries }, { data: me }, { data: tokens }] = await Promise.all([
    viewerId(),
    getProfiles(),
    db.from("delivery_preferences").select("user_id, kind, connector").eq("workspace_id", ws),
    db.from("deliveries").select("*, actions(kind, status, question), prompts(source, answered_at, submitter_id, metric_id)").eq("workspace_id", ws).order("id", { ascending: false }).limit(80),
    db.from("memberships").select("role").eq("workspace_id", ws).eq("user_id", await viewerId()).maybeSingle(),
    db.from("tokens").select("code, metric_id, submitter_id").eq("workspace_id", ws),
  ]);
  // Deliveries about a thread the viewer may not read stay hidden.
  const readable = new Set((await readableActions(viewer)).map((a) => a.id));
  // Prompts and notices are private to their sender and recipient, except in Demo Mode, where anyone plays them.
  const visible = (deliveries ?? []).filter((d) => (d.action_id ? readable.has(d.action_id) : demo || d.recipient_id === viewer || d.sender_id === viewer));
  // A Token code opens someone's submission form: only their own go to the browser (in Demo Mode, all of the demo).
  const ownTokens = (tokens ?? []).filter((t) => demo || t.submitter_id === viewer);
  return (
    <>
      <PageHeader title="Connectors" sub="How Ziffr reaches people where they already work, and how their answers come back. Values arrive the same way." />
      <ConnectorsScreen viewer={viewer} isOwner={me?.role === "owner" || me?.role === "admin"} people={people} prefs={(prefs ?? []) as PrefRow[]} deliveries={visible as DeliveryRow[]} tokens={ownTokens} />
    </>
  );
}
