// First Steps, the closing screen (spec 0067; GLOSSARY: First Steps, Value, Dashboard, Invitation, Connector): what was
// set up, what is still open, and where to go. A first value that is missing is said and asked for; invitations that wait
// for it are shown locked, with the reason.
import { Lock } from "lucide-react";
import type { FirstStepsDone } from "@ziffr/core/first-steps-providers";
import { Button } from "@/components/ui/button";
import { Facts, MAIN_BUTTON, Panel, Quiet, Reading, useShown } from "../closing-parts";
import { Choice, Choices, ScreenHeading } from "../parts";
import { readDone } from "../value-actions";
import type { ScreenProps } from "./types";

/** How many Metric names the summary spells out. */
const NAMED = 3;

function rows(d: FirstStepsDone): [string, string][] {
  const [count, names] = [d.metrics.length, d.metrics.slice(0, NAMED).join(", ") + (d.metrics.length > NAMED ? ` and ${d.metrics.length - NAMED} more` : "")];
  const made: [string, string] = d.set ? ["Ready-made set", `${d.set}, ${count} ${count === 1 ? "metric" : "metrics"}`] : [count === 1 ? "First metric" : "Metrics", names || "None yet"];
  return [
    ["Workspace", d.workspace],
    made,
    ["First value", d.value ? `${d.value.value} for ${d.value.period}` : d.open ? "Still waiting" : "In"],
    ["Asked for values", d.asked],
  ];
}

/** What was set up. */
export function DoneScreen({ context, go, leave }: ScreenProps) {
  const ws = context.workspace?.id ?? "";
  const { data, failed, reload } = useShown(() => readDone(ws));
  if (!data) {
    return (
      <>
        <ScreenHeading title="Your Workspace" />
        <Reading failed={failed} onRetry={() => void reload()} />
      </>
    );
  }
  return <Closing data={data} go={go} leave={leave} />;
}

/** The closing screen as drawn from what the core handed over. */
export function Closing({ data, go, leave }: { data: FirstStepsDone } & Pick<ScreenProps, "go" | "leave">) {
  const board = data.dashboard === null ? null : `/dashboards/${data.dashboard}`;
  return (
    <div className="space-y-4">
      <ScreenHeading title={data.open ? "One thing is still open" : "Your Workspace is ready"}>
        {data.open ? "Your first value is not in yet, so your dashboard is empty." : null}
      </ScreenHeading>
      <Facts label="What is set up" rows={rows(data)} />
      {data.open ? (
        <div className="space-y-2 text-center">
          <Button type="button" className={MAIN_BUTTON} onClick={() => go("value")}>Send my first value</Button>
          {board && <Quiet onClick={() => leave(board)}>Open dashboard</Quiet>}
        </div>
      ) : (
        <Button type="button" className={MAIN_BUTTON} onClick={() => leave(board ?? "/")}>{board ? "Open dashboard" : "Open Ziffr"}</Button>
      )}
      <section aria-labelledby="fs-next" className="space-y-2 pt-2">
        <h2 id="fs-next" className="text-sm font-medium">Optional next steps</h2>
        <Choices>
          {data.invitesLocked ? (
            <Panel className="flex items-center gap-3">
              <Lock aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="font-medium">Invite your team (locked)</p>
                <p className="text-muted-foreground">Send your first value to open invitations.</p>
              </div>
            </Panel>
          ) : (
            <Choice title="Invite your team" hint="Let colleagues see the numbers" onPick={() => leave("/team")} />
          )}
          <Choice title="Connect Slack or Telegram" hint="Answer requests where you already work" onPick={() => leave("/connectors")} />
        </Choices>
      </section>
    </div>
  );
}
