// A key for n8n in a trial (spec 0052, ticket 12; GLOSSARY: Feed, Feed Key, Test Metric): linked from the ways in and out.
// Only the Owner of a running Trial Workspace has it; everyone else, and the demo, goes on to Home.
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { trialFeedKey } from "@ziffr/core/trial-feed-key";
import { SITE_URL } from "@/lib/sign-in";
import { N8nKey } from "./n8n-key";

/** The page. */
export default async function TrialN8nPage() {
  if (await isDemo()) redirect("/");
  const found = await trialFeedKey(await currentActor());
  if (!found) redirect("/");
  // Only the Test Metric's name and slug and the key's prefix and last day reach the browser, never a secret.
  return (
    <>
      <PageHeader title="A key for n8n" sub="Send values to your trial from n8n or any program. The key works until your trial ends." />
      <N8nKey siteUrl={SITE_URL} metric={found.metric} feedKey={found.key} />
    </>
  );
}
