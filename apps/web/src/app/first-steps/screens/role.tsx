// First Steps, "What is your role?" (spec 0067; GLOSSARY: First Steps, Business Function).
import { BUSINESS_FUNCTIONS, BUSINESS_FUNCTION_LABELS } from "@ziffr/pack/business-functions";
import { Choice, Choices, ScreenHeading, Skip } from "../parts";
import type { ScreenProps } from "./types";

/** The asker's own Business Function. */
export function RoleScreen({ answers, next }: ScreenProps) {
  return (
    <>
      <ScreenHeading title="What is your role?">So that relevant metrics come first.</ScreenHeading>
      <Choices columns>
        {BUSINESS_FUNCTIONS.map((v) => <Choice key={v} title={BUSINESS_FUNCTION_LABELS[v]} selected={answers.role === v} onPick={() => next({ role: v })} />)}
      </Choices>
      <Skip onSkip={() => next({ role: null })} />
    </>
  );
}
