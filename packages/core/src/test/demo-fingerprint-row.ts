// The demo walk's fingerprint of a row (GLOSSARY: Demo Reset; spec 0051, ticket 4): a row without the ids the shared
// sequences hand out and without the times it was written, so that the demo after a Demo Reset, which makes every row
// again with new ids, compares equal to the seed it came from. Pure, so it is tried without a database. Tests only.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IS_ID_KEY = /(^|_)id$|[a-z]Id$/;
const IS_IDS_KEY = /(^|_)ids$|[a-z]Ids$/;
const IS_TIME_KEY = /_at$|[a-z]At$/;

/** Whether a value is an id the database made: a number or a UUID. A text id a person chose ("sara", "t-ben") is kept. */
const isMadeId = (v: unknown) => typeof v === "number" || (typeof v === "string" && UUID.test(v));

/** A value without its made ids and write times, at any depth, with object keys in a fixed order. */
export function withoutIdsAndTimes(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => withoutIdsAndTimes(v));
  if (value === null || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(value).sort()) {
    const v = (value as Record<string, unknown>)[k];
    if (IS_TIME_KEY.test(k)) continue;
    if (IS_ID_KEY.test(k) && isMadeId(v)) continue;
    if (IS_IDS_KEY.test(k) && Array.isArray(v) && v.every(isMadeId)) continue;
    out[k] = withoutIdsAndTimes(v);
  }
  return out;
}

/** The text a table's rows are hashed by: each row without ids and times, the rows sorted so that their order, which follows the ids, does not matter. */
export function idFreeRows(rows: readonly unknown[]): string {
  return JSON.stringify(rows.map((r) => JSON.stringify(withoutIdsAndTimes(r))).sort());
}
