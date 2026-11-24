// The old address of the Trial Guide (spec 0052, ticket 12; GLOSSARY: Setup Guide, Trial Guide): a trial now uses the Setup
// Guide like every Workspace, so bookmarks and old links go on to /setup. Fixed paths only, nothing from the request; the
// demo has no guide and goes home.
import { redirect } from "next/navigation";
import { isDemo } from "@/lib/auth";

/** The page; only ever a redirect. */
export default async function TrialGuideMoved() {
  redirect((await isDemo()) ? "/" : "/setup");
}
