// First Steps, "How would you like to start?" (spec 0067; GLOSSARY: First Steps, Metric, Dashboard).
import { Choice, Choices, ScreenHeading, Unsaved } from "../parts";
import type { ScreenProps } from "./types";

/** The two ways in; neither is chosen beforehand. */
export function StartScreen({ context, go }: ScreenProps) {
  return (
    <>
      <ScreenHeading title="How would you like to start?">Either way, everything can be changed later.</ScreenHeading>
      {context.unsaved && <Unsaved />}
      <Choices>
        <Choice title="Start with a ready-made set" hint="Metrics, a dashboard and reminders, prepared for your kind of work." action="Browse sets" onPick={() => go("sets")} />
        <Choice title="Start from a clean slate" hint="An empty Workspace. We add your first metric together." action="Add a metric" onPick={() => go("first")} />
      </Choices>
    </>
  );
}
