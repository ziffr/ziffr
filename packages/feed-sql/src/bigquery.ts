// The SQL Feed's BigQuery driver (spec 0048, GLOSSARY: Feed): reads a warehouse with the person's own application
// default credentials, never a login Ziffr holds. Every query is a single SELECT, binds the period as DATE
// parameters, is dry-run first and refused above `max_bytes_billed`, and the real job carries the same cap and a
// time limit, so a Feed cannot run up a bill. The vendor package is an optional peer dependency, loaded only here.
import type { SqlRunner } from "./index.js";

/** The bytes a query may bill when the file sets no `max_bytes_billed`: 10 GB. */
export const DEFAULT_MAX_BYTES_BILLED = 10 * 1024 ** 3;

/** How long a job may run when the file sets no `statement_timeout_ms`. */
const DEFAULT_TIMEOUT_MS = 60_000;

/** The part of a BigQuery job this driver uses (structural, so nothing must be installed to type or test it). */
type Job = { metadata?: { statistics?: { totalBytesProcessed?: string; query?: { statementType?: string } } }; getQueryResults: () => Promise<[Record<string, unknown>[], ...unknown[]]> };

/** The part of the `@google-cloud/bigquery` client this driver uses. */
type BigQueryClient = { createQueryJob: (options: Record<string, unknown>) => Promise<[Job, ...unknown[]]> };

/** The vendor package's shape: a constructor taking the project. */
type BigQueryModule = { BigQuery: new (options: { projectId: string }) => BigQueryClient };

/** Refuses anything that is not one SELECT (or WITH ... SELECT) statement: comments and quoted text are ignored, one
 * trailing semicolon is fine, any other is a second statement. BigQuery's own dry run also reports the statement type. */
export function checkSelect(text: string): void {
  const bare = text.replace(/--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`[^`]*`/g, " ").trim().replace(/;\s*$/, "");
  if (bare.includes(";")) throw new Error("A BigQuery query must be a single statement; remove the extra semicolon and statement.");
  if (!/^(select|with|\()/i.test(bare)) throw new Error("A BigQuery query must be a SELECT (or WITH ... SELECT); this Feed never changes the warehouse.");
}

/** Opens a BigQuery runner from the file's `project` (or GOOGLE_CLOUD_PROJECT) and application default credentials;
 * `load` gives the vendor package and is replaced in tests. */
export async function connect(
  config: Record<string, unknown>,
  env: Record<string, string | undefined>,
  load: () => Promise<unknown> = () => import("@google-cloud/bigquery" as string),
): Promise<SqlRunner> {
  const project = (typeof config.project === "string" && config.project) || env.GOOGLE_CLOUD_PROJECT;
  if (!project) throw new Error("Name the Google Cloud project: set `project` in the file or GOOGLE_CLOUD_PROJECT in the environment.");
  const cap = config.max_bytes_billed === undefined ? DEFAULT_MAX_BYTES_BILLED : Number(config.max_bytes_billed);
  if (!Number.isSafeInteger(cap) || cap <= 0) throw new Error("max_bytes_billed must be a whole number of bytes above zero.");
  const timeoutMs = Math.max(1000, Math.min(Math.trunc(Number(config.statement_timeout_ms)) || DEFAULT_TIMEOUT_MS, 600_000));
  let client: BigQueryClient;
  try {
    client = new ((await load()) as BigQueryModule).BigQuery({ projectId: project });
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "ERR_MODULE_NOT_FOUND" || code === "MODULE_NOT_FOUND") throw new Error("The bigquery dialect needs the optional package @google-cloud/bigquery. Install it next to @ziffr/feed-sql (npm install @google-cloud/bigquery) and run again.");
    throw e;
  }
  return {
    query: async (text, params) => {
      checkSelect(text);
      // The period goes in as typed DATE parameters, never into the text.
      const base = { query: text, params: { period_start: params[0], period_end: params[1] }, types: { period_start: "DATE", period_end: "DATE" }, useLegacySql: false };
      const [dry] = await client.createQueryJob({ ...base, dryRun: true });
      const type = dry.metadata?.statistics?.query?.statementType;
      if (type && type !== "SELECT") throw new Error(`A BigQuery query must be a SELECT, not ${type}.`);
      const estimate = Number(dry.metadata?.statistics?.totalBytesProcessed ?? 0);
      if (estimate > cap) throw new Error(`The query would process an estimated ${estimate} bytes, more than the ${cap} bytes max_bytes_billed allows. Filter on the table's partition column, or raise max_bytes_billed in the file.`);
      const [job] = await client.createQueryJob({ ...base, maximumBytesBilled: String(cap), jobTimeoutMs: timeoutMs });
      const [rows] = await job.getQueryResults();
      return rows;
    },
    close: async () => {},
  };
}
