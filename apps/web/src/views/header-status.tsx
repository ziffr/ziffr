"use client";
// Where a widget's target chip is drawn (GLOSSARY: Target Range; colour only ever means on or off target): in a dashboard's widget
// frame it sits beside the widget's title, so a number or gauge card stays clean; everywhere else (a Preview, a View Link, a
// deck, the Metric page) there is no frame to report to and it is drawn where the design puts it, as before. In a frame the chip
// is drawn in the header when the card is wide enough for it beside the title (a container query on the frame), and in the body
// when it is not, so a narrow card keeps its title. The design asks for the chip with plain values; the frame draws it.
import { createContext, useContext, useEffect } from "react";
import { TargetChip } from "@/components/target-chip";

/** What a chip needs: the same props TargetChip takes, all plain values. */
export type HeaderStatus = React.ComponentProps<typeof TargetChip>;

/** The card width, as a container query on the frame (`@container/frame`), from which the chip moves to the header. */
export const HEADER_FITS = { showHeader: "hidden @min-[16rem]/frame:inline-flex", hideBody: "@min-[16rem]/frame:hidden" } as const;

const Publish = createContext<((s: HeaderStatus | null) => void) | null>(null);

/** The widget frame provides this, to receive the chip its body would draw. */
export const HeaderStatusProvider = Publish.Provider;

/** The chip a design asks for: reported to the frame's header when there is one, else drawn here. */
export function StatusChip(props: HeaderStatus) {
  const publish = useContext(Publish);
  // The props are numbers and words (a metric's target and unit settings), so their text is a stable key.
  const key = JSON.stringify([props.metric, props.value, props.note, props.numberStyle]);
  useEffect(() => {
    publish?.(props);
    return () => publish?.(null);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // In a frame: the body's copy is hidden once the card is wide enough for the header's.
  return publish ? <span className={`contents ${HEADER_FITS.hideBody}`}><TargetChip {...props} /></span> : <TargetChip {...props} />;
}
