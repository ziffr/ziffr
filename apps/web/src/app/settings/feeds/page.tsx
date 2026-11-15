// Feeds in the workspace settings (spec 0012; GLOSSARY: Feed, Feed Key, Access Log): programs outside Ziffr that bring
// in values from another system. Owners and Admins make them, their keys, and see how each is doing.
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { listFeeds } from "@ziffr/core/feeds";
import { accessLog } from "@ziffr/core/access-log";
import { PageHeader } from "@/components/page-header";
import { Feeds } from "./feeds";

export default async function FeedsPage() {
  const actor = await currentActor();
  if (await isDemo()) {
    return (
      <>
        <PageHeader title="Feeds" />
        <p className="text-sm text-muted-foreground">The demo has no Feeds: a Feed Key there would write into a workspace everyone shares.</p>
      </>
    );
  }
  if (actor.role !== "owner" && actor.role !== "admin") {
    return (
      <>
        <PageHeader title="Feeds" />
        <p className="text-sm text-muted-foreground">Owners and Admins set up Feeds. Ask one of them to connect a system, then choose its Feed under a Metric&rsquo;s Settings.</p>
      </>
    );
  }
  const feeds = await listFeeds(actor);
  // Each key's recent calls, for the Owners and Admins who manage the Feed: the Access Log.
  const logs = Object.fromEntries(await Promise.all(feeds.flatMap((f) => f.keys).map(async (k) => [k.id, await accessLog(actor, k.id, 20)] as const)));
  return (
    <>
      <PageHeader title="Feeds" />
      <Feeds feeds={feeds} logs={logs} />
    </>
  );
}
