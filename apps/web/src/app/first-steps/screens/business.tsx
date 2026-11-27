// First Steps, "What kind of business is it?" (spec 0067; GLOSSARY: First Steps, Workspace Profile).
import { useState } from "react";
import { FIRST_INDUSTRIES } from "@ziffr/core/first-steps-screens";
import { INDUSTRIES, INDUSTRY_LABEL } from "@ziffr/core/workspace-profile";
import { Button } from "@/components/ui/button";
import { Choice, Choices, ScreenHeading, Skip } from "../parts";
import type { ScreenProps } from "./types";

/** The Workspace Profile's industry: eight to start with, the rest on request. */
export function BusinessScreen({ answers, next }: ScreenProps) {
  // An answer that is among the rest shows the whole list, so what is chosen is always in sight.
  const [all, setAll] = useState(answers.industry !== null && !FIRST_INDUSTRIES.includes(answers.industry));
  const shown = all ? [...FIRST_INDUSTRIES, ...INDUSTRIES.filter((v) => !FIRST_INDUSTRIES.includes(v))] : FIRST_INDUSTRIES;
  return (
    <>
      <ScreenHeading title="What kind of business is it?" />
      <Choices columns>
        {shown.map((v) => <Choice key={v} title={INDUSTRY_LABEL[v]} selected={answers.industry === v} onPick={() => next({ industry: v })} />)}
      </Choices>
      {!all && <Button type="button" variant="outline" className="mt-3 h-11 w-full md:h-9" onClick={() => setAll(true)}>Show all industries</Button>}
      <Skip onSkip={() => next({ industry: null })} />
    </>
  );
}
