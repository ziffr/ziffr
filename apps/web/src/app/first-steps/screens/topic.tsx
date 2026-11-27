// First Steps, "What would you like to track?" (spec 0067; GLOSSARY: First Steps).
import { TOPICS, TOPIC_LABEL } from "@ziffr/core/first-steps-screens";
import { Choice, Choices, ScreenHeading, Skip } from "../parts";
import type { ScreenProps } from "./types";

/** What someone who uses Ziffr alone wants to follow. Kept in this browser only. */
export function TopicScreen({ answers, next }: ScreenProps) {
  return (
    <>
      <ScreenHeading title="What would you like to track?" />
      <Choices>
        {TOPICS.map((v) => <Choice key={v} title={TOPIC_LABEL[v]} selected={answers.topic === v} onPick={() => next({ topic: v })} />)}
      </Choices>
      <Skip onSkip={() => next({ topic: null })} />
    </>
  );
}
