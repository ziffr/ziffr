// What the Pack kit's command does (GLOSSARY: Pack): `ziffr-pack check my.pack.json` runs on a file exactly the checks Ziffr runs
// before it shows or installs a Pack, and says what is wrong, with each problem's line. It reads only the file named.
import { readFileSync } from "node:fs";
import { checkPack } from "./pack.js";
import { checkWorkspaceExport } from "./workspace-export.js";
import { checkMarketplaceAnswer, type MarketplaceAnswerKind } from "./marketplace.js";

/** What the command prints and the code it ends with, for the arguments it was given. */
export function run(args: string[], read: (path: string) => string = (p) => readFileSync(p, "utf8")): { out: string[]; code: number } {
  const [command, file, ...rest] = args;
  if (command === "check-export" && file) return runExport(file, read);
  // Here the first word is the kind of answer, and the file follows it.
  if (command === "check-answer" && file && rest[0]) return runAnswer(file, rest[0], rest.slice(1), read);
  if (command !== "check" || !file) return { out: ["Usage: ziffr-pack check <file.pack.json> [--ziffr <version>]", "Checks a Pack as Ziffr does before installing it. --ziffr also checks the Ziffr it needs.", "       ziffr-pack check-export <file.jsonl>", "Checks a Workspace Export (unzipped) as Ziffr does before importing it.", `       ziffr-pack check-answer <${Object.keys(ANSWERS).join("|")}> <answer.json> [--key <base64>] [--reserve-key <base64>]`, "Checks what a Marketplace answers, and with its public keys the signatures too."], code: 2 };
  const z = rest.indexOf("--ziffr");
  const ziffr = z >= 0 ? rest[z + 1] : undefined;
  if (ziffr !== undefined && !/^\d+\.\d+\.\d+$/.test(ziffr)) return { out: ["--ziffr takes a version such as 0.12.0."], code: 2 };
  let text: string;
  try {
    text = read(file);
  } catch {
    return { out: [`${file}: cannot be read.`], code: 2 };
  }
  const res = checkPack(text, ziffr);
  if (!res.ok) return { out: res.problems.map((p) => `${file}${p.line ? `:${p.line}` : ""}: ${p.path ? `${p.path} ` : ""}${p.message}`), code: 1 };
  const out = [`${file}: ${res.pack.name} ${res.pack.version} is a valid Pack, ${res.items} item${res.items === 1 ? "" : "s"}.${res.needsOwner ? " It holds Themes: an Owner installs it." : ""}`];
  for (const t of res.assistantTexts) out.push(`${file}${t.line ? `:${t.line}` : ""}: ${t.path} reads like an instruction to an AI assistant; Ziffr shows it to whoever installs the Pack: “${t.text}”`);
  return { out, code: 0 };
}

/** `check-export`: a Workspace Export's lines, each problem with its line, and its counts when it is sound. */
function runExport(file: string, read: (path: string) => string): { out: string[]; code: number } {
  let text: string;
  try {
    text = read(file);
  } catch {
    return { out: [`${file}: cannot be read.`], code: 2 };
  }
  const res = checkWorkspaceExport(text);
  if (!res.ok) return { out: res.problems.map((p) => `${file}${p.line ? `:${p.line}` : ""}: ${p.path ? `${p.path} ` : ""}${p.message}`), code: 1 };
  return { out: [`${file}: a valid Workspace Export of “${res.header.workspace.name}”, ${res.records.toLocaleString("en")} records, ${res.counts.metric} Metrics and ${res.counts.value.toLocaleString("en")} values.`], code: 0 };
}

const ANSWERS: Record<string, MarketplaceAnswerKind> = { packs: "packs", version: "version", updates: "updates", "updates-request": "updatesRequest" };

/** `check-answer`: one answer of a Marketplace held to the contract; the keys given also verify its signatures. */
function runAnswer(kind: string, file: string, options: string[], read: (path: string) => string): { out: string[]; code: number } {
  if (!Object.hasOwn(ANSWERS, kind)) return { out: [`check-answer takes one of ${Object.keys(ANSWERS).join(", ")}.`], code: 2 };
  const named = (flag: string) => options.flatMap((o, n) => (o === flag && options[n + 1] ? [options[n + 1]] : []));
  const keys = { signing: named("--key"), reserve: named("--reserve-key") };
  let text: string;
  try {
    text = read(file);
  } catch {
    return { out: [`${file}: cannot be read.`], code: 2 };
  }
  const res = checkMarketplaceAnswer(ANSWERS[kind], text, keys.signing.length || keys.reserve.length ? keys : undefined);
  if (!res.ok) return { out: res.problems.map((p) => `${file}${p.line ? `:${p.line}` : ""}: ${p.path ? `${p.path} ` : ""}${p.message}`), code: 1 };
  return { out: [`${file}: a valid ${kind} answer.`], code: 0 };
}
