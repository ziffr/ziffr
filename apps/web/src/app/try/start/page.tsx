// The old address of the Trial Guide (spec 0052, spec 0067; GLOSSARY: Setup Guide, Trial Guide): a new trial starts with
// First Steps, so bookmarks and old links go Home, which leads whoever has a step left. A fixed path only, nothing from
// the request.
import { redirect } from "next/navigation";

/** The page; only ever a redirect. */
export default async function TrialGuideMoved() {
  redirect("/");
}
