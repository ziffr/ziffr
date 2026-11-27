// First Steps, "Who are your customers?" (spec 0067; GLOSSARY: First Steps, Workspace Profile).
import { CUSTOMER_LABEL } from "@ziffr/core/first-steps-screens";
import { SEGMENTS } from "@ziffr/core/workspace-profile";
import { Choice, Choices, ScreenHeading, Skip } from "../parts";
import type { ScreenProps } from "./types";

/** The Workspace Profile's segment. */
export function CustomersScreen({ answers, next }: ScreenProps) {
  return (
    <>
      <ScreenHeading title="Who are your customers?" />
      <Choices>
        {SEGMENTS.map((v) => <Choice key={v} title={CUSTOMER_LABEL[v]} selected={answers.segment === v} onPick={() => next({ segment: v })} />)}
      </Choices>
      <Skip onSkip={() => next({ segment: null })} />
    </>
  );
}
