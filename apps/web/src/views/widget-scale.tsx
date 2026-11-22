"use client";
// How large a Widget's card is drawn (GLOSSARY: Widget): one number, the widget scale, from the card's size. Up to the
// size of a usual Widget on a dashboard it is 1, so small Widgets and phones look as they always did; a large one, and one
// presented on a wall screen, grows its words, rows, axes and gauge with it, up to a limit (#763).
// The card sets it as `--widget-scale` for CSS (the `widget-text-*` utilities in globals.css) and hands it to the parts
// drawn in SVG (chart axes) through a context, so both read the same number.
import { createContext, useContext, useLayoutEffect, useState, type RefObject } from "react";

/** The card size at which a widget is drawn as it always was; bigger cards grow from here. */
export const WIDGET_BASE = { width: 520, height: 300 } as const;
/** The most a widget grows: a widget presented one at a time on a wall screen reads from across a room. */
export const WIDGET_SCALE_MAX = 3;

/** The widget scale of a card of this size: the smaller of its growth in width and height, so words never outgrow a
 * short wide Widget, between 1 and WIDGET_SCALE_MAX, in steps of 0.05 so a resize does not redraw on every pixel. */
export function widgetScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const raw = Math.min(width / WIDGET_BASE.width, height / WIDGET_BASE.height);
  return Math.round(Math.min(WIDGET_SCALE_MAX, Math.max(1, raw)) * 20) / 20;
}

const WidgetScaleContext = createContext(1);

/** The widget scale's provider, set by a widget's card. */
export const WidgetScaleProvider = WidgetScaleContext.Provider;

/** The widget scale of the card this part is drawn in; 1 outside a card (a deck's slide, a Metric's page). */
export const useWidgetScale = () => useContext(WidgetScaleContext);

/** Follows a card's size and gives its widget scale; 1 until it is measured, so the server draws today's sizes. */
export function useMeasuredWidgetScale(ref: RefObject<HTMLElement | null>): number {
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const measure = () => setScale(widgetScale(el.clientWidth, el.clientHeight));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return scale;
}

/** The style that hands the widget scale to CSS on a card. */
export const widgetScaleStyle = (scale: number) => ({ "--widget-scale": scale }) as React.CSSProperties;
