"use client";
// The first screen of a guided Pack set-up (spec 0068; GLOSSARY: Pack, Preview, Sample Data): the Pack's name and one
// sentence, its first dashboard drawn with Sample Data (without one, its deck's first slides), "Use this pack", what
// happens and what the person needs. For one of Ziffr's own Packs it is the Pack's Preview as the Packs page shows it,
// with the button in Install's place. The drawing holds made-up numbers only, never the Workspace's.
import { useMemo } from "react";
import Link from "next/link";
import { ScreenHeading } from "@/app/first-steps/parts";
import { PackPreviewView } from "@/app/settings/packs/preview-view";
import { PHONE_ACTIONS, PHONE_BUTTON, PHONE_TEXT_LINK } from "@/app/setup/phone";
import { DashboardTemplatePreview } from "@/components/preview";
import { SlidesPreview } from "@/components/slide-preview";
import { Button } from "@/components/ui/button";
import type { NumberStyle } from "@ziffr/core/number-style";
import { packSample } from "@ziffr/core/pack-sample";
import type { PackStartDrawing } from "@ziffr/core/pack-start";
import type { StartStep } from "@ziffr/core/pack-start-steps";
import type { PackPreview } from "@ziffr/core/packs";
import { useBoxSize } from "@/views/use-box-size";
import { Lines, NOTE } from "./parts";
import { namesWords } from "./providers";

// As in the Pack's Preview: narrower than this, a dashboard's first widgets are shown one below the other.
const SCALED_FROM = 520;
const STACKED_WIDGETS = 3;

type Look = { viewer: string; numberStyle: NumberStyle };

/** What the Pack draws before it is set up: its dashboard, or else its deck's first slides. */
export function PackDrawing({ drawing, viewer, numberStyle }: Look & { drawing: PackStartDrawing }) {
  const [box, { w }] = useBoxSize<HTMLDivElement>();
  const own = useMemo(() => packSample(drawing.sample.pack, drawing.sample.metrics), [drawing.sample]);
  const { dashboard, deck } = drawing;
  if (!dashboard && !deck) return null;
  return (
    <figure className="space-y-1.5">
      <figcaption className="text-xs text-muted-foreground">{dashboard ? <>The dashboard &ldquo;{dashboard.name}&rdquo;, drawn with Sample Data.</> : <>The first slides of &ldquo;{deck!.name}&rdquo;, drawn with Sample Data.</>}</figcaption>
      <div ref={box} className="min-w-0">
        {dashboard
          ? <DashboardTemplatePreview template={dashboard} viewer={viewer} numberStyle={numberStyle} width={w || undefined} pack={own} stacked={w > 0 && w < SCALED_FROM ? STACKED_WIDGETS : undefined} />
          : <SlidesPreview deck={{ slots: deck!.slots, body: { slides: deck!.slides } }} pack={own} viewer={viewer} numberStyle={numberStyle} />}
      </div>
    </figure>
  );
}

type Props = Look & {
  step: Extract<StartStep, { step: "preview" }>;
  /** The Pack's whole Preview, where there is one: a Pack of Ziffr's own. */
  view: PackPreview | null;
  drawing: PackStartDrawing | null;
  /** The key of the dashboard drawn, so the list below does not draw it again. */
  drawn?: string;
  blocked: string | null;
  /** What an earlier try made, which is kept. */
  unfinished: string[] | null;
  onUse: () => void;
  /** The way back out. */
  exit: string;
};

/** The Preview, with "Use this pack". */
export function PreviewScreen({ step, view, drawing, drawn, viewer, numberStyle, blocked, unfinished, onUse, exit }: Props) {
  const drawingNode = drawing && <PackDrawing drawing={drawing} viewer={viewer} numberStyle={numberStyle} />;
  const actions = (
    <div className="space-y-5">
      {unfinished && !blocked && <p className={NOTE}>You started this before. Made so far: {namesWords(unfinished)}. Going on makes only what is missing.</p>}
      {blocked && <p role="alert" className={NOTE}>{blocked}</p>}
      {!step.setsUp && !blocked && <p className={NOTE}>There is nothing to set up: this Pack is in your Workspace.</p>}
      <div className={PHONE_ACTIONS}>
        {step.setsUp && <Button type="button" className={`${PHONE_BUTTON} sm:px-6`} disabled={blocked !== null} onClick={onUse}>{unfinished ? "Finish setting up" : "Use this pack"}</Button>}
        <Link href={exit} className={`${PHONE_TEXT_LINK} justify-center self-center text-sm`}>All packs</Link>
      </div>
      <Lines title={step.heading} items={step.happens} />
      <Lines title="You need" items={step.needs} />
    </div>
  );
  return (
    <>
      <ScreenHeading title={step.name}>{step.line || undefined}</ScreenHeading>
      {view
        ? <PackPreviewView preview={view} viewer={viewer} numberStyle={numberStyle} use={{ drawing: drawingNode, drawn, actions }} />
        : <div className="space-y-5">{drawingNode}{actions}</div>}
    </>
  );
}
