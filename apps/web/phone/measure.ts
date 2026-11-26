// The phone rules a page must meet (spec 0055; GLOSSARY: Route Tier), measured in the browser: nothing wider than the
// screen, everything that is tapped at least 44 px, and fields with text of at least 16 px (iOS Safari zooms in on less).
// It catches size and width only; whether a screen reads well on a phone still takes a look.
import type { Page } from "@playwright/test";

/** The smallest height and width of something tapped, in CSS pixels. */
const TAP_TARGET = 44;
/** The smallest text in a field, in CSS pixels. */
const FIELD_TEXT = 16;

/** Which rule an element breaks. */
type PhoneRule = "sideways" | "tap-target" | "field-text";

/** An element let off one rule, on every page or on the named routes only, and why. */
export type Allowance = { rule: PhoneRule; selector: string; routes?: string[]; reason: string };

type Limits = { width: number; tap: number; text: number; allowed: Allowance[] };

/** Runs inside the page, so it may use nothing from this module but what it is given. Answers one line per problem. */
function measure({ width, tap, text, allowed }: Limits): string[] {
  const problems: string[] = [];
  const style = (e: Element, pseudo?: string) => getComputedStyle(e, pseudo);
  const box = (e: Element) => e.getBoundingClientRect();
  const label = (e: Element) => {
    const words = (e.getAttribute("aria-label") || (e as HTMLElement).innerText || e.getAttribute("placeholder") || e.getAttribute("name") || "").trim().replace(/\s+/g, " ");
    return `<${e.tagName.toLowerCase()}> "${words.slice(0, 40)}" class="${(e.getAttribute("class") ?? "").slice(0, 80)}"`;
  };
  const report = (rule: PhoneRule, e: Element, found: string) => {
    if (!allowed.some((a) => a.rule === rule && e.matches(a.selector))) problems.push(`${rule}: ${label(e)} ${found}`);
  };
  // On the screen for a person: has a size, is not hidden, and is not switched off behind an open panel.
  const shown = (e: Element) => {
    const r = box(e);
    return r.width > 1 && r.height > 1 && e.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && !e.closest("[inert], [aria-hidden='true']");
  };
  const all = [...document.body.querySelectorAll("*")];

  // Sideways. The app clips what sticks out of <body>, which would hide it from the page's width (and from the person:
  // it is cut off). So the clip is lifted for the measurement, and anything past the edge that no frame of its own holds
  // is named too. A wide thing that scrolls or is cut inside a frame that fits is fine.
  const roots = [document.documentElement, document.body];
  const before = roots.map((r) => r.getAttribute("style"));
  for (const r of roots) r.style.setProperty("overflow-x", "visible", "important");
  const pageWidth = document.documentElement.scrollWidth;
  roots.forEach((r, i) => (before[i] === null ? r.removeAttribute("style") : r.setAttribute("style", before[i])));
  const held = (e: Element) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      if (style(p).overflowX !== "visible" && box(p).right <= width + 1) return true;
    }
    return false;
  };
  const sticksOut = all.filter((e) => box(e).right > width + 1 && shown(e) && !held(e));
  // The outermost one says it: its children stick out because it does.
  for (const e of sticksOut.filter((x) => !sticksOut.includes(x.parentElement as Element)).slice(0, 8)) report("sideways", e, `ends at ${Math.round(box(e).right)} px of ${width}`);
  if (pageWidth > width + 1 && !problems.length) problems.push(`sideways: the page is ${pageWidth} px wide on a ${width} px screen`);

  // Tap targets. A field or box is also tapped on its label, and a link may be stretched by a ::before or ::after.
  const big = (w: number, h: number) => w >= tap - 0.5 && h >= tap - 0.5;
  const stretched = (e: Element) => ["::before", "::after"].some((pseudo) => {
    const s = style(e, pseudo);
    return s.content !== "none" && s.position === "absolute" && big(parseFloat(s.width), parseFloat(s.height));
  });
  const labels = (e: Element) => [...((e as HTMLInputElement).labels ?? []), e.closest("label")].filter((l): l is HTMLLabelElement => l !== null);
  // A link inside a sentence keeps the height of its line (WCAG 2.5.8 makes the same exception).
  const inSentence = (e: Element) => {
    if (e.tagName !== "A" || style(e).display !== "inline") return false;
    let block = e.parentElement;
    while (block && style(block).display === "inline") block = block.parentElement;
    return (block?.textContent ?? "").replace(e.textContent ?? "", "").replace(/[^\p{L}\p{N}]/gu, "").length > 0;
  };
  const targets = "a[href], button, input:not([type='hidden']), select, textarea, summary, [role='button'], [role='link'], [role='tab'], [role='menuitem'], [role='menuitemcheckbox'], [role='menuitemradio'], [role='option'], [role='switch'], [role='checkbox'], [role='radio'], [role='combobox']";
  const usable = (e: Element) => shown(e) && !e.matches(":disabled, [aria-disabled='true']") && style(e).pointerEvents !== "none";
  for (const e of [...document.body.querySelectorAll(targets)].filter(usable)) {
    const r = box(e);
    if (big(r.width, r.height) || labels(e).some((l) => big(box(l).width, box(l).height)) || stretched(e) || inSentence(e)) continue;
    report("tap-target", e, `is ${Math.round(r.width)} by ${Math.round(r.height)} px`);
  }

  const fields = "input:not([type='hidden'], [type='checkbox'], [type='radio'], [type='range'], [type='color'], [type='file'], [type='button'], [type='submit'], [type='reset'], [type='image']), select, textarea, [contenteditable]:not([contenteditable='false'])";
  for (const e of [...document.body.querySelectorAll(fields)].filter(usable)) {
    const size = parseFloat(style(e).fontSize);
    if (size < text - 0.1) report("field-text", e, `has ${size} px text`);
  }
  return problems;
}

/** What the page as it stands breaks. It measures until two looks agree, so a chart or font that arrives late does not decide. */
export async function phoneProblems(page: Page, allowed: Allowance[] = []): Promise<string[]> {
  const width = page.viewportSize()?.width;
  if (!width) throw new Error("The phone check needs a viewport.");
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const look = () => page.evaluate(measure, { width, tap: TAP_TARGET, text: FIELD_TEXT, allowed });
  let last = await look();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(250);
    const next = await look();
    if (next.join("\n") === last.join("\n")) return next;
    last = next;
  }
  return last;
}
