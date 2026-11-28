// The colours of a deck's slides (spec 0069; GLOSSARY: Theme): a drawing names roles, and a Theme's tokens give each
// role its colour. Every role is one of the twelve places a PowerPoint theme has for colours, at most paled with
// PowerPoint's own colour changes, so the screen and a file show the same colour and changing a theme colour in
// PowerPoint reaches every slide. Words are kept readable: a Theme colour too close to its ground is darkened or
// lightened here, once, for both. Slides are always as designed: no dark variant. Pure.
import { fromHsl, toHsl } from "../theme-dark";
import { contrastRatio, readableOn } from "../theme-look";
import { mixHex, slideTones } from "../themes";
import type { ThemeTokens } from "../types";

/** A place in a PowerPoint theme's colour scheme. */
export type Slot = "dk1" | "lt1" | "dk2" | "lt2" | "accent1" | "accent2" | "accent3" | "accent4" | "accent5" | "accent6";

/** A deck's colours in the places of a PowerPoint theme. */
export type Slots = Record<Slot, string>;

/** Every role a drawing can name instead of a colour. The three panel roles follow the deck's emphasis. */
export const ROLES = [
  "ink", "surface", "cover", "canvas", "accent", "coveraccent", "good", "bad", "muted", "rule",
  "accentsoft", "neutral", "neutral2", "badsoft", "onaccent", "covertext", "panel", "paneltext", "panelmark",
] as const;

/** What a drawing says instead of a colour. */
export type Role = (typeof ROLES)[number];

/** How loud a Deck Design's panel is: a deck setting. */
export type Emphasis = "strong" | "quiet";

/** A theme place with PowerPoint's saturation and lightness changes (shares of 1). */
export type Paint = { slot: Slot; satMod?: number; lumMod?: number; lumOff?: number };

/** The pale roles: this share of a place's colour mixed into the slide's surface. */
const PALE = {
  accentsoft: ["accent1", 0.12],
  badsoft: ["accent4", 0.09],
  neutral: ["dk1", 0.22],
  neutral2: ["dk1", 0.1],
} as const satisfies Partial<Record<Role, readonly [Slot, number]>>;

/** A colour that reads on every one of these grounds, as far as one colour can. */
const readableOnAll = (colour: string, grounds: string[], min = 4.5) => grounds.reduce((c, ground) => readableOn(c, ground, min), colour);

/** The better of two colours for words on a fill. */
const better = (slots: Pick<Slots, "lt1" | "dk1">, ground: string): "lt1" | "dk1" => (contrastRatio(slots.lt1, ground) >= contrastRatio(slots.dk1, ground) ? "lt1" : "dk1");

/** A Theme's colours in the places of a PowerPoint theme, adjusted where words would not be readable. */
export function deckSlots(tokens: ThemeTokens): Slots {
  const tones = slideTones(tokens);
  const lt1 = tokens.surface.toUpperCase();
  // The quiet panel must be seen against the slide: where cards and ground are one colour, the target band's is taken.
  const lt2 = (contrastRatio(tokens.canvas, lt1) < 1.03 ? tokens.band : tokens.canvas).toUpperCase();
  const dk1 = readableOnAll(tokens.ink, [lt2, lt1], 7);
  const dk2 = readableOn(tones.cover, tones[better({ lt1, dk1 }, tones.cover) === "lt1" ? "surface" : "ink"], 7);
  // Words stand on the surface, on the quiet panel and on a pale fill of their own colour.
  const words = (colour: string, pale = 0.12) => {
    const first = readableOnAll(colour, [lt2, lt1]);
    return readableOn(first, mixHex(first, lt1, pale * 100));
  };
  return {
    dk1,
    lt1,
    dk2,
    lt2,
    accent1: words(tokens.accent),
    accent2: readableOn(tones["cover-accent"], dk2),
    accent3: words(tokens.good),
    accent4: words(tokens.bad),
    accent5: readableOnAll(tokens.muted, [lt2, lt1]),
    accent6: tokens.rule.toUpperCase(),
  };
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** The theme place, and the colour changes, that a role stands for. */
export function paintOf(slots: Slots, role: Role, emphasis: Emphasis): Paint {
  if (role in PALE) {
    const [slot, share] = PALE[role as keyof typeof PALE];
    // Mixed channel by channel, as the eye expects; then written as the changes PowerPoint has for it.
    const to = channels(slots.lt1);
    const mixed = `#${channels(slots[slot]).map((v, i) => Math.round(v * share + to[i]! * (1 - share)).toString(16).padStart(2, "0")).join("")}`;
    const [, s0, l0] = toHsl(slots[slot]);
    const [, s1, l1] = toHsl(mixed);
    const round = (v: number) => Math.round(v * 100000) / 100000;
    return { slot, satMod: round(s0 ? s1 / s0 : 1), lumMod: share, lumOff: round(l1 - l0 * share) };
  }
  const strong = emphasis === "strong";
  const places: Record<Exclude<Role, keyof typeof PALE>, Slot> = {
    ink: "dk1",
    surface: "lt1",
    onaccent: better(slots, slots.accent1),
    covertext: better(slots, slots.dk2),
    cover: "dk2",
    canvas: "lt2",
    accent: "accent1",
    coveraccent: "accent2",
    good: "accent3",
    bad: "accent4",
    muted: "accent5",
    rule: "accent6",
    panel: strong ? "dk2" : "lt2",
    paneltext: strong ? better(slots, slots.dk2) : "dk1",
    panelmark: strong ? "accent2" : "accent1",
  };
  return { slot: places[role as keyof typeof places] };
}

/** The colour a role shows, as #RRGGBB. */
export function hexOf(slots: Slots, role: Role, emphasis: Emphasis): string {
  const { slot, satMod = 1, lumMod = 1, lumOff = 0 } = paintOf(slots, role, emphasis);
  const base = slots[slot];
  if (satMod === 1 && lumMod === 1 && lumOff === 0) return base;
  const [h, s, l] = toHsl(base);
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return fromHsl(h, clamp(s * satMod), clamp(l * lumMod + lumOff));
}

/** Every role's colour, as the screen writes them. */
export function roleColours(slots: Slots, emphasis: Emphasis): Record<Role, string> {
  return Object.fromEntries(ROLES.map((role) => [role, hexOf(slots, role, emphasis)])) as Record<Role, string>;
}
