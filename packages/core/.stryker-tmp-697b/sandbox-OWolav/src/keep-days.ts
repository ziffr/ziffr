// @ts-nocheck
// The days and counts Installation Settings in effect, for the code that uses them (spec 0025, ticket #517; GLOSSARY:
// Installation Settings). Two readers: `daysNow` for showing and counting, which may fall back to the defaults when the
// stored settings cannot be read; `daysStrict` for what deletes, which throws instead, so a database that hiccups never
// turns a longer setting into the default. Both give the default for a value outside its range (installation-days.ts).
import { daysSetting } from "./installation-days";
import { settingsInEffect, settingsInEffectStrict } from "./settings-in-effect";

/** The value of a days or count setting in effect now. */
export async function daysNow(name: string): Promise<number> {
  return daysSetting(name, await settingsInEffect());
}

/** The same for a job that deletes: throws when the stored settings cannot be read. */
export async function daysStrict(name: string): Promise<number> {
  return daysSetting(name, await settingsInEffectStrict());
}
