// The SQL Feed's dialects (spec 0048, GLOSSARY: Feed): which database language a file's queries are written in, how
// :period_start and :period_end become that dialect's own bound parameters, and which driver file reads the database.
// Each driver beyond Postgres is one more file next to this one that exports `connect`, loaded only when the file
// asks for it, so people on Postgres install nothing new.
import type { SqlRunner } from "./index.js";

/** The dialects a SQL Feed's file may name. */
export const DIALECTS = ["postgres", "bigquery", "snowflake"] as const;

/** One of the dialects. */
export type Dialect = (typeof DIALECTS)[number];

/** The dialect when the file names none. */
export const DEFAULT_DIALECT: Dialect = "postgres";

/** What a driver file exports: opens a read-only runner from the file's settings and the environment. */
export type DriverModule = { connect: (config: Record<string, unknown>, env: Record<string, string | undefined>) => SqlRunner | Promise<SqlRunner> };

/** For each optional driver: its file next to this one and the vendor package the person must install for it. */
const DRIVERS: Record<Exclude<Dialect, "postgres">, { file: string; package: string }> = {
  bigquery: { file: "bigquery", package: "@google-cloud/bigquery" },
  snowflake: { file: "snowflake", package: "snowflake-sdk" },
};

/** The parameter syntax each dialect's client takes: Postgres numbered `$1`, `$2`; BigQuery named `@period_start`
 * and `@period_end` (the driver binds the two values under those names); Snowflake numbered binds `:1`, `:2`, which
 * like Postgres may be used more than once in a query. */
const SYNTAX: Record<Dialect, { start: string; end: string }> = {
  postgres: { start: "$1", end: "$2" },
  bigquery: { start: "@period_start", end: "@period_end" },
  snowflake: { start: ":1", end: ":2" },
};

/** A query with :period_start and :period_end turned into the dialect's bound parameters. The values always go to
 * the runner as `[period_start, period_end]`. A Postgres `::cast` stays as it is. */
export function bindFor(dialect: Dialect, query: string): string {
  const s = SYNTAX[dialect];
  return query.replace(/(?<!:):period_start\b/g, () => s.start).replace(/(?<!:):period_end\b/g, () => s.end);
}

/** Loads a driver file by dialect (`load` is replaced in tests). A missing file or vendor package becomes an error
 * that says what to install. */
export async function loadDriver(dialect: Exclude<Dialect, "postgres">, load: (file: string) => Promise<unknown> = (file) => import(/* @vite-ignore */ `./${file}.js`)): Promise<DriverModule> {
  const { file, package: pkg } = DRIVERS[dialect];
  try {
    const mod = (await load(file)) as Partial<DriverModule>;
    if (typeof mod.connect !== "function") throw new Error(`the ${dialect} driver has no connect function`);
    return mod as DriverModule;
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") {
      throw new Error(`The ${dialect} dialect needs the optional package ${pkg}. Install it next to @ziffr/feed-sql (npm install ${pkg}) and run again.`);
    }
    throw e;
  }
}
