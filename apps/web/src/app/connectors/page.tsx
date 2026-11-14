import { currentActor } from "@/lib/viewer";
import { getProfiles } from "@/lib/data";
import { connectorsView } from "@ziffr/core/page-data";
import { emailOptedOut } from "@ziffr/core/email-opt-out";
import { inboundEnabled, mailEnabled } from "@ziffr/core/mail";
import { slackConnection } from "@ziffr/core/slack-connection";
import { mySlackLink, slackOptedOut } from "@ziffr/core/slack-people";
import { PageHeader } from "@/components/page-header";
import { isDemo } from "@/lib/auth";
import { ConnectorsScreen, type DeliveryRow, type PrefRow } from "./screen";
import { SlackPanel } from "./slack-panel";

const SLACK_OUTCOME: Record<string, string> = {
  connected: "Slack is connected.",
  cancelled: "Slack was not connected.",
  refused: "That did not work: start “Add to Slack” again from here.",
  elsewhere: "That Slack workspace is already connected to another Ziffr workspace.",
  org_install: "Connect one Slack workspace, not a whole Enterprise organisation.",
  failed: "Slack did not answer as expected. Try again in a moment.",
};

export default async function ConnectorsPage({ searchParams }: { searchParams: Promise<{ slack?: string }> }) {
  const actor = await currentActor();
  const viewer = actor.personId;
  // What the person may see is decided in the core: readable Deliveries, and only their own Token codes. The Slack
  // connection comes as its name only; its token never leaves the core (spec 0007).
  const [people, view, optedOut, demo, slack, slackLink, slackStopped, { slack: outcome }] = await Promise.all([getProfiles(), connectorsView(actor), emailOptedOut(actor), isDemo(), slackConnection(actor), mySlackLink(actor), slackOptedOut(actor), searchParams]);
  return (
    <>
      <PageHeader title="Connectors" sub="How Ziffr reaches people where they already work, and how their answers come back. Values arrive the same way." />
      {(slack.enabled || slack.team) && <SlackPanel connection={slack} link={slackLink} stopped={slackStopped} notice={outcome ? SLACK_OUTCOME[String(outcome)] : undefined} />}
      <ConnectorsScreen viewer={viewer} isOwner={view.isAdmin} people={people} prefs={view.prefs as PrefRow[]} deliveries={view.deliveries as unknown as DeliveryRow[]} tokens={view.tokens} optedOut={optedOut} demo={demo} email={mailEnabled() ? (inboundEnabled() ? "both" : "send") : "off"} slack={slack.team ? "connected" : "off"} />
    </>
  );
}
