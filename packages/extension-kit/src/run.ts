// What the Extension Kit's command does (GLOSSARY: Extension Kit): `ziffr-extension check ./my-extension` reads the
// folder, runs the shape and static checks on it and, when they pass, the checks that run its code (in a process of
// its own, never in this one), prints each problem with its file and line, and ends with 1. `--static` stops after the
// static checks, and nothing in the folder is run.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { checkExtensionFiles, problemLine } from "./check.js";
import { checkManifest } from "./manifest.js";
import { runChecks, type RunOptions } from "./run-checks.js";

const MAX_FILES = 200;
const MAX_FILE_BYTES = 1_048_576;

/** Reads a folder's files as text, by path relative to it; files in `node_modules` and folders that start with a dot are left out. */
export function readExtensionFolder(dir: string): Map<string, string> {
  const files = new Map<string, string>();
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && files.size < MAX_FILES && statSync(p).size <= MAX_FILE_BYTES) files.set(relative(dir, p).split("\\").join("/"), readFileSync(p, "utf8"));
    }
  };
  walk(dir);
  return files;
}

/** What the command prints and the code it ends with, for the arguments it was given. */
export async function run(args: string[], read: (dir: string) => Map<string, string> = readExtensionFolder, options: RunOptions = {}): Promise<{ out: string[]; code: number }> {
  const staticOnly = args.includes("--static");
  const [command, dir] = args.filter((a) => a !== "--static");
  if (command !== "check" || !dir) return { out: ["Usage: ziffr-extension check <folder> [--static]", "Checks an Extension as Ziffr does before reading it: its shape and static rules, then what it does when it runs (--static stops before that)."], code: 2 };
  let files: Map<string, string>;
  try {
    files = read(dir);
  } catch {
    return { out: [`${dir}: cannot be read.`], code: 2 };
  }
  const problems = checkExtensionFiles(files);
  if (problems.length) return { out: problems.map((p) => `${dir}/${problemLine(p)}`), code: 1 };
  const m = checkManifest(files.get("extension.json") ?? "");
  const name = m.ok ? `${m.manifest.id} ${m.manifest.version}` : "the Extension";
  if (staticOnly || !m.ok) return { out: [`${dir}: ${name} has the right shape and passes the static rules.`], code: 0 };
  if (m.manifest.kind !== "method") return { out: [`${dir}: ${name} has the right shape and passes the static rules; the checks that run a mark's code come with marks.`], code: 0 };
  const ran = await runChecks(files, m.manifest, options);
  if (ran.length) return { out: ran.map((p) => `${dir}/${problemLine(p)}`), code: 1 };
  return { out: [`${dir}: ${name} passes every check: shape, static rules, determinism, budget, refusals, reference, coverage and mutation.`], code: 0 };
}
