// First Steps, "Who will use Ziffr?" (spec 0067; GLOSSARY: First Steps, Join Request).
import { USED_BY, USED_BY_LABEL, type UsedBy } from "@ziffr/core/first-steps-screens";
import { AskToJoin } from "@/app/welcome/ask";
import { Choice, Choices, ScreenHeading } from "../parts";
import type { ScreenProps } from "./types";

const HINT: Record<UsedBy, string> = { team: "A company, department, shop or club", me: "Personal numbers such as health or money" };

/** The first question, with the offer to ask to join a Workspace above it. */
export function WhoScreen({ context, answers, next }: ScreenProps) {
  return (
    <>
      {context.joinable.length > 0 && <div className="mb-8"><AskToJoin workspaces={context.joinable} /></div>}
      <ScreenHeading title="Who will use Ziffr?">We tailor the setup to your answer. It takes about two minutes.</ScreenHeading>
      <Choices>
        {USED_BY.map((v) => <Choice key={v} title={USED_BY_LABEL[v]} hint={HINT[v]} selected={answers.who === v} onPick={() => next({ who: v })} />)}
      </Choices>
    </>
  );
}
