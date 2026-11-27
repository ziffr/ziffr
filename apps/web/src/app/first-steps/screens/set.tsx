// First Steps, one ready-made set (spec 0067; GLOSSARY: First Steps, Pack, Preview, Sample Data): what the person would
// get, before anything is installed. The Packs page's own Preview draws its dashboard with Sample Data; "Use this set"
// opens the guided set-up of this Pack (spec 0068), which asks its few questions. Nothing is written here.
import { useSearchParams } from "next/navigation";
import { PackPreviewView } from "@/app/settings/packs/preview-view";
import { PHONE_ACTIONS, PHONE_BUTTON } from "@/app/setup/phone";
import { Lines } from "@/app/use-pack/parts";
import { packSetUpPath } from "@/app/use-pack/switch";
import { Button } from "@/components/ui/button";
import type { NumberStyle } from "@ziffr/core/number-style";
import type { PackPreview } from "@ziffr/core/packs";
import { Quiet, Reading, useShown } from "../closing-parts";
import { ScreenHeading } from "../parts";
import { readSet } from "../set-actions";
import { SetsScreen } from "./sets";
import type { ScreenProps } from "./types";

/** How many Metric names show under the button. */
const NAMED = 5;

/** The set the address names; without one, the list to choose from. */
export function SetScreen(props: ScreenProps) {
  const id = useSearchParams().get("set");
  return id ? <OneSet key={id} id={id} {...props} /> : <SetsScreen {...props} />;
}

function OneSet({ id, context, go, leave }: ScreenProps & { id: string }) {
  const ws = context.workspace?.id ?? "";
  const { data, failed, reload } = useShown(() => readSet(ws, id));
  const manifest = data?.preview.manifest;
  const others = () => go("sets");
  return (
    <>
      <ScreenHeading title={manifest?.name ?? "Ready-made set"}>{manifest?.summary}</ScreenHeading>
      {data
        ? <OneSetView preview={data.preview} numberStyle={data.numberStyle} viewer={context.personId} onUse={() => leave(packSetUpPath(data.preview.manifest.id))} onOthers={others} />
        : (
          <div className="space-y-3">
            <Reading failed={failed} onRetry={() => void reload()} />
            <Quiet onClick={others}>See other sets</Quiet>
          </div>
        )}
    </>
  );
}

type ViewProps = { preview: PackPreview; numberStyle: NumberStyle; viewer: string; onUse: () => void; onOthers: () => void };

/** One set as drawn from its Preview. */
export function OneSetView({ preview, numberStyle, viewer, onUse, onOthers }: ViewProps) {
  const names = preview.items.filter((i) => i.kind === "metric").map((i) => i.name);
  const more = names.length - NAMED;
  const actions = (
    <div className="space-y-5">
      <div className={PHONE_ACTIONS}>
        <Button type="button" className={`${PHONE_BUTTON} sm:px-6`} onClick={onUse}>Use this set</Button>
        <Quiet onClick={onOthers}>See other sets</Quiet>
      </div>
      <Lines title="Some of the metrics" items={[...names.slice(0, NAMED), ...(more > 0 ? [`And ${more} more`] : [])]} />
    </div>
  );
  return <PackPreviewView preview={preview} viewer={viewer} numberStyle={numberStyle} use={{ caption: "Example dashboard, shown with sample numbers.", actions }} />;
}
