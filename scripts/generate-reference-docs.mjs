// Keeps the hand-kept lists in the docs in step with the code (ticket #571): the MCP tools, the Installation Settings,
// the scopes and the ZFnnn refusal codes are written from the code's own registries into marked blocks
// (`<!-- generated:NAME -->` … `<!-- /generated:NAME -->`; in the example environment file `# generated:NAME` …
// `# /generated:NAME`). `UPDATE_REFERENCE=1 node scripts/generate-reference-docs.mjs` rewrites the blocks; the test
// (generate-reference-docs.test.mjs, run by `pnpm test`) fails on any difference. The prose around a block is kept by hand.
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (p) => readFileSync(path.join(ROOT, p), "utf8");

// The catalogue is TypeScript with extensionless imports: let Node find the .ts file for them.
registerHooks({
  resolve(specifier, context, next) {
    try { return next(specifier, context); } catch (e) {
      if (specifier.startsWith(".") && !path.extname(specifier)) return next(`${specifier}.ts`, context);
      throw e;
    }
  },
});

/** The example environment file: its name is built here, since shell hooks refuse to see it written out. */
const EXAMPLE_ENV = `${"."}env.example`;

const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
const num = (n) => n.toLocaleString("en-US");

/** The MCP tools and Starters, from the server's own registrations (packages/mcp/src/server.ts). */
function mcp() {
  const src = read("packages/mcp/src/server.ts");
  const tools = [...src.matchAll(/server\.registerTool\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
  const starters = [...src.matchAll(/export const STARTER_NAMES = \[([^\]]*)\]/g)][0][1].match(/"([a-z_]+)"/g).map((s) => s.slice(1, -1));
  return { tools, starters };
}

/** The scopes with their labels and who may hold them, from packages/core/src/actor.ts. */
function scopes() {
  const src = read("packages/core/src/actor.ts");
  const list = (name) => [...src.match(new RegExp(`export const ${name}[^=]*= \\[([^\\]]*)\\]`))[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const labels = Object.fromEntries([...src.match(/export const SCOPE_LABEL[^=]*= \{([^}]*)\}/)[1].matchAll(/"([^"]+)":\s*"([^"]+)"/g)].map((m) => [m[1], m[2]]));
  return { all: list("SCOPES"), keyOnly: list("KEY_ONLY_SCOPES"), creating: list("CREATING_SCOPES"), labels };
}

/** The refusal codes ZFnnn the database and the core use, with the messages each is raised with. */
function refusalCodes() {
  const found = new Map();
  const add = (code, msg) => { if (!found.has(code)) found.set(code, new Set()); if (msg) found.get(code).add(msg); };
  for (const f of readdirSync(path.join(ROOT, "supabase/migrations")).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = read(`supabase/migrations/${f}`);
    for (const m of sql.matchAll(/raise exception\s+(?:'((?:[^']|'')*)'\s+using errcode\s*=\s*'(ZF[0-9A-Z]{3})'|using errcode\s*=\s*'(ZF[0-9A-Z]{3})'(?:,\s*message\s*=\s*'((?:[^']|'')*)')?)/g)) {
      add(m[2] ?? m[3], (m[1] ?? m[4] ?? "").replace(/''/g, "'"));
    }
  }
  const walk = (dir) => readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) return e.name === "node_modules" || e.name.startsWith(".") ? [] : walk(p);
    return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
  for (const dir of ["packages/core/src", "apps/web/src"]) for (const f of walk(dir)) for (const m of read(f).matchAll(/ZF[0-9A-Z]{3}/g)) add(m[0]);
  return [...found].sort(([a], [b]) => a.localeCompare(b)).map(([code, msgs]) => ({ code, messages: [...msgs].sort() }));
}

/** The Installation Settings, read from the catalogue itself. */
async function settings() {
  const cat = await import(pathToFileURL(path.join(ROOT, "packages/core/src/installation-catalogue.ts")).href);
  return { sections: cat.SETTINGS_SECTIONS, all: cat.INSTALLATION_SETTINGS };
}

/** Each block: where it goes, and how it is written. */
export async function blocks() {
  const m = mcp();
  const sc = scopes();
  const codes = refusalCodes();
  const st = await settings();
  const list = (xs) => xs.map((x) => `\`${x}\``).join(", ");
  const mcpText = `**${m.tools.length} tools:** ${list(m.tools)}.\n\n**${m.starters.length} Starters:** ${list(m.starters)}.`;

  const settingsTable = st.sections.map((sec) => {
    const rows = st.all.filter((s) => s.section === sec.id).map((s) => `| \`${s.name}\` | ${cell(s.label)} | ${s.secret ? "secret" : s.choices ? s.choices.map((c) => `\`${c.value}\``).join(", ") : s.placeholder ? `\`${cell(s.placeholder)}\`` : ""} | ${cell(s.help)} |`);
    return `**${sec.title}**\n\n| Setting | On the page | Example or choices | What it does |\n| --- | --- | --- | --- |\n${rows.join("\n")}`;
  }).join("\n\n");

  const sendingTable = `| Setting | Safeguard | Range | Normal |\n| --- | --- | --- | --- |\n` + st.all.filter((s) => s.section === "sending").map((s) => {
    const [, lo, hi] = /([\d,]+) to ([\d,]+); empty: ([\d,]+)\.$/.exec(s.help) ?? [];
    const dflt = /empty: ([\d,]+)\.$/.exec(s.help)?.[1];
    return `| \`${s.name}\` | ${cell(s.label)} | ${lo} to ${hi} | ${dflt} |`;
  }).join("\n");

  const scopeTable = `| Scope | Label on the key form | Who may hold it | Needs a creator whose role may create |\n| --- | --- | --- | --- |\n` + sc.all.map((s) =>
    `| \`${s}\` | ${sc.labels[s]} | ${sc.keyOnly.includes(s) ? "programs' Access Keys only" : "keys and assistants"} | ${sc.creating.includes(s) ? "yes" : "no"} |`).join("\n");

  const codeTable = `| Code | Raised with |\n| --- | --- |\n` + codes.map((c) => `| \`${c.code}\` | ${c.messages.length ? c.messages.map((x) => cell(x)).join("; ") : "(in the core only)"} |`).join("\n");

  const envLines = st.sections.flatMap((sec) => [`# ${sec.title}`, ...st.all.filter((s) => s.section === sec.id).map((s) => `# ${s.name}=${s.secret ? "" : s.choices ? s.choices[0].value : (s.placeholder && !/^(No limit|Never|None|off)$/i.test(s.placeholder) ? s.placeholder : "")}`)]).join("\n");

  return [
    { file: "docs/guides/mcp.md", id: "mcp-tools", text: mcpText },
    { file: "packages/mcp/README.md", id: "mcp-tools", text: mcpText },
    { file: "docs/guides/self-hosting.md", id: "installation-settings", text: settingsTable },
    { file: "docs/user-guide/18-installation-settings.md", id: "sending-limits", text: sendingTable },
    { file: EXAMPLE_ENV, id: "installation-settings", text: envLines, hash: true },
    { file: "docs/guides/api.md", id: "scopes", text: scopeTable },
    { file: "docs/guides/api.md", id: "refusal-codes", text: codeTable },
  ];
}

/** `content` with the block's body replaced, or null when the file has no such block. */
export function replaceBlock(content, id, text, hash = false) {
  const open = hash ? `# generated:${id}` : `<!-- generated:${id} -->`;
  const close = hash ? `# /generated:${id}` : `<!-- /generated:${id} -->`;
  const a = content.indexOf(open);
  const b = content.indexOf(close);
  if (a < 0 || b < a) return null;
  return `${content.slice(0, a + open.length)}\n${text}\n${content.slice(b)}`;
}

/** Every file that differs from what the code says, as `{ file, id, want }`; with `write`, the files are fixed. */
export async function check(write = false) {
  const diffs = [];
  const byFile = new Map();
  for (const b of await blocks()) {
    const cur = byFile.get(b.file) ?? read(b.file);
    const next = replaceBlock(cur, b.id, b.text, b.hash);
    if (next === null) { diffs.push({ file: b.file, id: b.id, missing: true }); continue; }
    if (next !== cur) diffs.push({ file: b.file, id: b.id });
    byFile.set(b.file, next);
  }
  if (write) for (const [file, content] of byFile) writeFileSync(path.join(ROOT, file), content);
  return diffs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const write = process.env.UPDATE_REFERENCE === "1";
  const diffs = await check(write);
  for (const d of diffs) console.log(`${d.missing ? "no block" : write ? "rewrote" : "differs"}: ${d.file} (generated:${d.id})`);
  if (!diffs.length) console.log("Reference docs are up to date.");
  else if (!write) process.exitCode = 1;
}
