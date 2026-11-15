// One Snapshot of a dashboard (spec 0013, ticket #175; GLOSSARY: Snapshot): the dashboard as it stood for a period,
// read top to bottom, with the values it kept. The core decides who may open it: whoever may open the dashboard once
// it is shown, its owner and Editors while it is a draft. Everything it shows comes from what it kept.
import { notFound, redirect } from "next/navigation";
import { Forbidden } from "@ziffr/core/actor";
import { openSnapshot, type OpenSnapshot } from "@ziffr/core/snapshots";
import { currentActor } from "@/lib/viewer";
import { getProfileMap } from "@/lib/data";
import { SnapshotScreen } from "./screen";

export default async function SnapshotPage({ params }: { params: Promise<{ id: string; sid: string }> }) {
  const { id, sid } = await params;
  const dashboardId = Number(id);
  const snapshotId = Number(sid);
  if (!Number.isInteger(dashboardId) || !Number.isInteger(snapshotId)) notFound();
  let snapshot: OpenSnapshot;
  try {
    snapshot = await openSnapshot(await currentActor(), snapshotId);
  } catch (err) {
    // One the person may not open looks like one that does not exist.
    if (err instanceof Forbidden) notFound();
    throw err;
  }
  if (snapshot.dashboardId !== dashboardId) redirect(`/dashboards/${snapshot.dashboardId}/snapshots/${snapshot.id}`);
  const people = await getProfileMap();
  return <SnapshotScreen snapshot={snapshot} takenBy={people[snapshot.takenBy]?.name ?? "someone"} />;
}
