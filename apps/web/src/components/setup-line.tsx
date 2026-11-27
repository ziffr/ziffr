"use client";
// GLOSSARY: Setup Guide. The Setup line (spec 0052, ticket 11): one slim line above every page for someone who has steps
// left and has not hidden the guide: how far they are and what is next, with Continue (the guide in the side panel) and Hide.
// The layout draws it only when the core says so (not for a Guest, never in the demo, not once finished or hidden); here it
// is also left off the full Setup page, where the steps are already the page, and off the new Metric page opened from the
// guide, which says its own next step. It is a labelled region, so it can be reached and skipped by landmark, and both
// buttons are ordinary buttons.
import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { STEP_INFO } from "@/app/setup/step-info";
import { hideSetup } from "@/app/setup/actions";
import { useOpenSetup } from "@/components/setup-panel";
import type { SetupStepId } from "@ziffr/core/setup-steps";

/** The line: "Setup: 2 of 5 done. Next: Ways in and out." with Continue and Hide. */
export function SetupLine({ done, total, next }: { done: number; total: number; next: SetupStepId | null }) {
  const path = usePathname();
  const router = useRouter();
  const open = useOpenSetup();
  const search = useSearchParams();
  const [pending, start] = useTransition();
  if (path === "/setup" || path.startsWith("/setup/")) return null;
  if (path === "/metrics/new" && search.get("setup") === "1") return null;
  return (
    <section aria-label="Setup Guide" className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 text-xs sm:px-6">
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Setup: {done} of {total} done.</span>
        {next && <> Next: {STEP_INFO[next].label}.</>}
      </p>
      <Button variant="outline" size="xs" onClick={() => open(false)} aria-haspopup="dialog">Continue</Button>
      <Button variant="ghost" size="xs" disabled={pending} onClick={() => start(async () => { const r = await hideSetup(); if (!(r && "error" in r)) router.refresh(); })}>Hide<span className="sr-only"> the Setup Guide</span></Button>
    </section>
  );
}
