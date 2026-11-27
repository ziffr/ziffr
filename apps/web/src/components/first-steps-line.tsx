"use client";
// GLOSSARY: First Steps. The line above every page while a Workspace's Owner has a step of First Steps left (spec 0067):
// what is next, with Continue and Hide, and in a trial that invitations stay closed until a value of their own is in.
// The layout draws it only when the core says so, and not once hidden.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { hideNextStepLine } from "@/app/first-steps/actions";
import { isActionError } from "@/lib/action-error";
import { FIRST_STEPS_PATH, type FirstStepsResume } from "@ziffr/core/first-steps-screens";

const NEXT: Record<Exclude<FirstStepsResume, "finished">, string> = {
  start: "choose what to track", value: "send your first value", sender: "say who sends the values", done: "send your first value",
};

/** The line: "Next: send your first value." with Continue and Hide. */
export function FirstStepsLine({ next, invitesClosed }: { next: Exclude<FirstStepsResume, "finished">; invitesClosed: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <section aria-label="First Steps" className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 pt-3 text-xs sm:px-6">
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">Next: {NEXT[next]}.</span>
        {invitesClosed && " Invitations stay closed until you have sent in a value."}
      </p>
      {/* A plain link: First Steps draws its own frame, so the page is loaded anew. */}
      <a href={`${FIRST_STEPS_PATH}?step=${next}`} className={buttonVariants({ variant: "outline", size: "xs", className: "max-sm:min-h-11" })}>Continue<span className="sr-only"> setting up</span></a>
      <Button variant="ghost" size="xs" className="max-sm:min-h-11" disabled={pending} onClick={() => start(async () => { const r = await hideNextStepLine(); if (!(r && isActionError(r))) router.refresh(); })}>Hide<span className="sr-only"> this line</span></Button>
    </section>
  );
}
