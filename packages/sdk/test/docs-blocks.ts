// The code examples in the guides and package READMEs (GLOSSARY: Access Key; ticket #571, part 3). A fenced block in
// sh, ts, js or python either runs in CI against the running app (`sh run`) or says why it does not (`sh skip="why"`):
// the words after the language are invisible in the rendered docs and stay with the block when it moves. A block whose
// first line is a `ziffr-test: <name>` comment is run by its own test (the verifiers in the Webhooks guide).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { repoFile } from "@ziffr/core/test/repo-file";

export type Block = { file: string; line: number; lang: string; mode: "run" | "skip" | "named" | "unmarked"; reason: string; code: string };

const LANGS = new Set(["sh", "ts", "js", "python"]);
const path = (p: string) => repoFile(p);
const markdown = (dir: string) => readdirSync(path(dir)).filter((f) => f.endsWith(".md")).map((f) => `${dir}/${f}`);

/** Every file whose examples are checked: the guides, the user guide and the READMEs. */
export const DOC_FILES = [
  "README.md", "apps/docs/README.md", ...markdown("docs/guides"), ...markdown("docs/user-guide"),
  ...readdirSync(path("packages")).map((p) => `packages/${p}/README.md`).filter((f) => existsSync(path(f))),
];

/** The index of the line that closes the block opened at `from`. */
function closing(lines: string[], from: number): number {
  let i = from + 1;
  while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) i++;
  return i;
}

/** The code blocks of one file that are in a language the examples are checked in. */
export function blocksOf(file: string): Block[] {
  const lines = readFileSync(path(file), "utf8").split("\n");
  const out: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)```(\w*)(.*)$/.exec(lines[i]);
    if (!open) continue;
    const end = closing(lines, i);
    if (LANGS.has(open[2])) {
      const code = lines.slice(i + 1, end).map((l) => l.slice(open[1].length)).join("\n");
      const meta = open[3].trim();
      const skip = /^skip="([^"]+)"$/.exec(meta);
      const mode = /^(\/\/|#) ziffr-test: /.test(code) ? "named" : meta === "run" ? "run" : skip ? "skip" : "unmarked";
      out.push({ file, line: i + 1, lang: open[2], code, mode, reason: skip?.[1] ?? "" });
    }
    i = end;
  }
  return out;
}

export const allBlocks = () => DOC_FILES.flatMap(blocksOf);
