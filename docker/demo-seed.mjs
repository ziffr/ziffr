// Which demo seed an Installation's demo was filled with (#604): the newest migration that defines a seed function.
// migrate.mjs stores it in the state/demo-filled marker and refills the demo when an upgrade brings a newer one.
import { readdirSync, readFileSync } from "node:fs";

const SEED_FUNCTION = /create\s+(or\s+replace\s+)?function\s+(public\.)?(prototype_seed_\w+|demo_reset)\b/i;

/** The file name of the newest migration that defines demo seed content, or "" when there is none. */
export function currentSeed(migrationsDir) {
  const names = readdirSync(migrationsDir).filter((n) => n.endsWith(".sql")).sort();
  for (const name of names.reverse()) {
    if (SEED_FUNCTION.test(readFileSync(`${migrationsDir}/${name}`, "utf8"))) return name;
  }
  return "";
}

/** Whether the demo must be filled: never filled (no marker), or filled with another seed than the current one. */
export function demoNeedsFilling(marker, seed) {
  if (marker === null) return true;
  return marker.split("\n").some((line) => line.startsWith("seed ")) ? !marker.split("\n").includes(`seed ${seed}`) : true;
}

/** The marker text: when it was filled and with which seed. */
export function markerText(seed, now = new Date()) {
  return `${now.toISOString()}\nseed ${seed}\n`;
}
