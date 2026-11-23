// When the demo is reset (spec 0051, ticket 1; GLOSSARY: Demo Reset, Demo Mode): a pure decision from the demo's state,
// the clock and the setting, so it is tried without a database. Where visitors may not change the demo (the setting
// is off, the only case today) every call resets, as the nightly job always did. Where they may, a call resets only a
// demo a visitor changed, or one that is no longer young.

/** The demo's single `demo_state` row, as the core reads it. */
export type DemoState = {
  generation: number;
  changedSinceReset: boolean;
  lastChangeAt: Date | null;
  resetAt: Date | null;
};

/** Whether visitors may change the demo: `ZIFFR_DEMO_CHANGES=1`, in effect only in a demo-only Installation (`ZIFFR_DEMO_ONLY=1`). */
export function demoChangesInEffect(env: Record<string, string | undefined>): boolean {
  return env.ZIFFR_DEMO_CHANGES === "1" && env.ZIFFR_DEMO_ONLY === "1";
}

const sameUtcDay = (a: Date, b: Date) => a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);

/** Whether a call of the reset job resets now. A demo is young until a day or a UTC date has passed since its last reset, so its periods reach up to today. */
export function shouldResetDemo(input: { changesInEffect: boolean; state: DemoState | null; now: Date }): boolean {
  const { changesInEffect, state, now } = input;
  if (!changesInEffect) return true;
  if (!state || !state.resetAt) return true;
  if (state.changedSinceReset) return true;
  const young = now.getTime() - state.resetAt.getTime() < 24 * 3_600_000 && sameUtcDay(state.resetAt, now);
  return !young;
}
