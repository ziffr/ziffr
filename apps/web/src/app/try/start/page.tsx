// The Trial Guide page (ticket 193; GLOSSARY: Trial Guide, Test Metric): where a new trial opens, one step at a time,
// from where Ziffr should ask its Owner to the first value they answer. The core decides who has a guide (the Owner
// of a running Trial Workspace) and what each way can do here; everyone else goes on to the app.
import { redirect } from "next/navigation";
import { currentActor } from "@/lib/viewer";
import { isDemo } from "@/lib/auth";
import { trialGuide } from "@ziffr/core/trial-guide";
import { ASK_NOW_EVERY_MINUTES } from "@ziffr/core/ask-now";
import { Guide } from "./guide";

/** The page; only for the Owner of a running Trial Workspace. */
export default async function TrialGuidePage() {
  if (await isDemo()) redirect("/");
  const guide = await trialGuide(await currentActor());
  if (!guide) redirect("/");
  // Only what the steps need: the Owner's own address, the Test Metric and the ways as the core says they are here.
  return <Guide guide={guide} askEveryMinutes={ASK_NOW_EVERY_MINUTES} />;
}
