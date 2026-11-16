// Where a widget lands on a slide when it is added with "+" rather than dropped (#13): the first free spot in the
// slide's content area, so it never covers what is already there. Pure: rectangles in, a rectangle out; the editor
// reads the slide's shapes and places the widget.

export type Rect = { x: number; y: number; w: number; h: number };

/** Space kept between a new widget and anything already on the slide, and the step the search moves in. */
const GAP = 24;
const STEP = 16;
/** A widget is never made smaller than this to fit. */
const MIN = { w: 240, h: 160 };

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP;

/** The first spot in `area` where a widget of `size` touches none of `taken`, scanning rows top to bottom. */
function firstFree(area: Rect, taken: Rect[], size: { w: number; h: number }): Rect | null {
  for (let y = area.y; y + size.h <= area.y + area.h; y += STEP) {
    for (let x = area.x; x + size.w <= area.x + area.w; x += STEP) {
      const r = { x, y, ...size };
      if (!taken.some((t) => overlaps(r, t))) return r;
    }
  }
  return null;
}

/** Where to put a widget of `size` in `area` of a slide `slide` wide and high, given what `taken` already covers:
 * the first free spot at its own size, else the largest smaller size that fits somewhere (same proportions, never
 * below 240 × 160), else offset from the last shape so it does not hide it. All in slide coordinates. */
export function freeSpot(area: Rect, taken: Rect[], size: { w: number; h: number }, slide: { w: number; h: number }): Rect {
  const own = { w: Math.min(size.w, area.w), h: Math.min(size.h, area.h) };
  for (let w = own.w; w >= MIN.w; w -= 2 * STEP) {
    const found = firstFree(area, taken, { w, h: Math.max(MIN.h, Math.round((own.h * w) / own.w)) });
    if (found) return found;
  }
  const last = taken[taken.length - 1] ?? area;
  return {
    x: Math.min(Math.max(last.x + 2 * GAP, 0), slide.w - own.w),
    y: Math.min(Math.max(last.y + 2 * GAP, 0), slide.h - own.h),
    ...own,
  };
}
