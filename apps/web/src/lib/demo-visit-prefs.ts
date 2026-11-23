// A demo visit's own pins and home dashboard (GLOSSARY: Demo Mode, Pinned Dashboard; spec 0051, ticket 7). Everyone in the demo
// views as the same few made-up people, so a pin or a home kept in a person's rows would be every visitor's; where visitors may
// change the demo these are kept in the visitor's browser instead (localStorage, per person viewed as), never sent anywhere.
// Pure and edge-safe: the reading, the rules and the matching after a Demo Reset (the seed's dashboards have new ids, so a saved
// one is found again by its name). The browser's storage is touched only in components/demo-visit-prefs.tsx.

/** A dashboard as a pin or a home remembers it: its id and, to find it after a reset, its name. */
export type DashboardRef = { id: number; name: string };

/** What a visit keeps for one person: `pins` is null until the visitor changes them (then the demo's own pins show). */
export type VisitPrefs = { pins: DashboardRef[] | null; home: DashboardRef | null };

/** The same limit as a real person's pins (pinned-dashboards.ts). */
export const MAX_DEMO_PINS = 8;

/** The storage key, per person viewed as. */
export function prefsKey(person: string): string {
  return `ziffr-demo-prefs:${person}`;
}

const isRef = (v: unknown): v is DashboardRef => typeof v === "object" && v !== null && Number.isSafeInteger((v as DashboardRef).id) && (v as DashboardRef).id > 0 && typeof (v as DashboardRef).name === "string" && (v as DashboardRef).name.length <= 200;

/** The prefs a stored string holds. Anything that is not the shape (nothing stored, edited by hand, a version of before) is "nothing kept". */
export function parsePrefs(raw: string | null): VisitPrefs {
  const none: VisitPrefs = { pins: null, home: null };
  if (!raw) return none;
  try {
    const v = JSON.parse(raw) as { pins?: unknown; home?: unknown };
    const pins = Array.isArray(v.pins) ? v.pins.filter(isRef).slice(0, MAX_DEMO_PINS).map((p) => ({ id: p.id, name: p.name })) : null;
    return { pins, home: isRef(v.home) ? { id: v.home.id, name: v.home.name } : null };
  } catch { return none; }
}

/** The stored form of prefs. */
export function serializePrefs(prefs: VisitPrefs): string {
  return JSON.stringify(prefs);
}

/** A saved dashboard found again among those the person may open now: by its id while that exists, else by its name (the
 * oldest of that name), so a pin or home survives a Demo Reset. Null when it is gone. */
export function resolveRef(ref: DashboardRef, known: DashboardRef[]): DashboardRef | null {
  const same = known.find((k) => k.id === ref.id);
  if (same) return same;
  const named = known.filter((k) => k.name === ref.name);
  return named.length ? named.reduce((a, b) => (b.id < a.id ? b : a)) : null;
}

/** Saved dashboards found again, in their order, without gaps or doubles. */
export function resolveRefs(refs: DashboardRef[], known: DashboardRef[]): DashboardRef[] {
  const out: DashboardRef[] = [];
  for (const r of refs) {
    const found = resolveRef(r, known);
    if (found && !out.some((o) => o.id === found.id)) out.push(found);
  }
  return out;
}

/** Pins one more at the end, or takes it off if it is there. `refused` says why when the list is full. */
export function togglePin(pins: DashboardRef[], ref: DashboardRef): { pins: DashboardRef[]; refused?: string } {
  if (pins.some((p) => p.id === ref.id)) return { pins: pins.filter((p) => p.id !== ref.id) };
  if (pins.length >= MAX_DEMO_PINS) return { pins, refused: `You can pin up to ${MAX_DEMO_PINS} dashboards. Unpin one first.` };
  return { pins: [...pins, { id: ref.id, name: ref.name }] };
}

/** The pins with one moved to a place (clamped); the same list when it is not there. */
export function movePin(pins: DashboardRef[], id: number, to: number): DashboardRef[] {
  const from = pins.findIndex((p) => p.id === id);
  if (from < 0) return pins;
  const next = [...pins];
  next.splice(Math.min(Math.max(to, 0), next.length - 1), 0, next.splice(from, 1)[0]);
  return next;
}
