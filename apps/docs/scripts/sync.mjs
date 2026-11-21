// Copies the repository's docs into src/content/docs for Starlight (ticket #551): the folders stay the only
// source, nothing is edited by hand. Per file it adds the title (the first "# " line), a sidebar order, and
// rewrites relative links: to another page of the site becomes a site link, to anything else in the repository
// (source, specs, JSON files) a GitHub link. Also writes the OpenAPI document for the API reference.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const app = resolve(here, "..");
const repo = resolve(app, "../..");
const out = join(app, "src/content/docs");
const images = join(app, "src/assets/docs-images");
const GITHUB = "https://github.com/ziffr/ziffr";
const BRANCH = process.env.DOCS_REF ?? "main";

/** repo path -> [section, slug, order]; the order is the position in its section's sidebar. */
const pages = new Map();
const add = (file, section, slug, order) => pages.set(file, { section, slug, order });
const list = (dir) => readdirSync(join(repo, dir)).filter((f) => f.endsWith(".md")).sort();

list("docs/user-guide").forEach((f) => {
  const m = /^(\d+)-(.+)\.md$/.exec(f);
  if (!m) return; // README.md is the table of contents, which the sidebar replaces
  const n = Number(m[1]);
  add(`docs/user-guide/${f}`, [1, 2, 3, 7].includes(n) ? "getting-started" : "user-guide", m[2], n);
});
const guides = {
  "self-hosting": ["self-hosting", "self-hosting"], email: ["self-hosting", "email"], jobs: ["self-hosting", "jobs"],
  slack: ["self-hosting", "slack"], telegram: ["self-hosting", "telegram"], usage: ["self-hosting", "usage"],
  api: ["api", "guide"], mcp: ["mcp", "guide"], feeds: ["feeds", "guide"], "github-feed": ["feeds", "github-feed"],
  webhooks: ["webhooks", "webhooks"], packs: ["packs-and-themes", "packs"], themes: ["packs-and-themes", "themes"],
  "view-designs": ["packs-and-themes", "view-designs"], "analysis-recipes": ["packs-and-themes", "analysis-recipes"],
  "answer-languages": ["packs-and-themes", "answer-languages"], "calculation-tests": ["contributing", "calculation-tests"],
  documentation: ["contributing", "documentation"],
};
Object.entries(guides).forEach(([name, [section, slug]], i) => add(`docs/guides/${name}.md`, section, slug, i));
list("docs/automations").forEach((f, i) => add(`docs/automations/${f}`, "webhooks", f === "README.md" ? "automation-templates" : `automation-${f.slice(0, -3)}`, 10 + i));
[["sdk", "sdk", "index"], ["mcp", "mcp", "package"], ["feed-kit", "feeds", "feed-kit"], ["feed-sql", "feeds", "feed-sql"],
  ["feed-github", "feeds", "feed-github"], ["feed-usage", "feeds", "feed-usage"], ["pack", "packs-and-themes", "pack-package"]]
  .forEach(([pkg, section, slug], i) => add(`packages/${pkg}/README.md`, section, slug, 20 + i));
[["CONTRIBUTING.md", "contributing"], ["GLOSSARY.md", "glossary"], ["SECURITY.md", "security"], ["CODE_OF_CONDUCT.md", "code-of-conduct"]]
  .forEach(([f, slug], i) => add(f, "contributing", slug, i));
/** Repo files that are shown by something other than a copy: the generated API reference. */
const special = new Map([["docs/reference/api.md", "api/reference/"]]);

const pageUrl = (p) => `${p.section}/${p.slug}/`;
const IMAGE = /\.(png|jpe?g|gif|webp|svg|avif)$/i;
const SCHEME = /^([a-z][a-z0-9+.-]*:|#|\/\/)/i;

/** Resolves one link target found in `file` to what it should be on the site. */
function rewrite(target, file, here_) {
  if (SCHEME.test(target)) return target;
  const [path, hash] = target.split(/(?=#)/);
  const abs = resolve(repo, dirname(file), decodeURI(path));
  const rel = relative(repo, abs).split("\\").join("/");
  if (rel.startsWith("..")) return target;
  const page = pages.get(rel);
  if (page) return relativeUrl(here_, pageUrl(page)) + (hash ?? "");
  if (special.has(rel)) return relativeUrl(here_, special.get(rel)) + (hash ?? "");
  if (rel === "docs/user-guide/README.md") return relativeUrl(here_, "getting-started/what-ziffr-is/");
  if (IMAGE.test(rel) && existsSync(abs)) return `@image:${rel}`;
  if (!existsSync(abs)) return target;
  return `${GITHUB}/${statSync(abs).isDirectory() ? "tree" : "blob"}/${BRANCH}/${rel}${hash ?? ""}`;
}

/** The link from the page at site path `from` (e.g. "user-guide/metrics/") to `to`, relative so any base works. */
function relativeUrl(from, to) {
  const r = posix.relative(posix.join("/", from), posix.join("/", to));
  return (r === "" ? "." : r) + "/";
}

/** Rewrites links outside code fences, then adds the title and order. */
function convert(file, page, text) {
  const here_ = pageUrl(page);
  const copied = new Set();
  let fenced = false;
  const lines = text.replace(/<!--[\s\S]*?-->\n?/g, "").split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) return line;
    return line.replace(/(\]\(|^\s*\[[^\]]+\]:\s*)(<[^>]+>|[^)\s]+)/g, (all, lead, raw) => {
      const url = rewrite(raw.replace(/^<|>$/g, ""), file, here_);
      if (url.startsWith("@image:")) {
        const img = url.slice(7);
        copied.add(img);
        return `${lead}${posix.relative(posix.join(out, page.section), posix.join(images, posix.basename(img)))}`;
      }
      return lead + url;
    });
  });
  copied.forEach((img) => { mkdirSync(images, { recursive: true }); cpSync(join(repo, img), join(images, posix.basename(img))); });
  let body = lines.join("\n").replace(/^\s+/, "");
  const h1 = /^# (.+)\n/.exec(body);
  const title = h1 ? h1[1].replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").replace(/[`*_]/g, "").trim() : page.slug;
  if (h1) body = body.slice(h1[0].length);
  const front = `---\ntitle: ${JSON.stringify(title)}\nsidebar:\n  order: ${page.order}\n---\n\n`;
  return front + body;
}

rmSync(out, { recursive: true, force: true });
rmSync(images, { recursive: true, force: true });
for (const [file, page] of pages) {
  const dest = join(out, page.section, `${page.slug}.md`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, convert(file, page, readFileSync(join(repo, file), "utf8")));
}
// The landing page is the one file written here by hand.
cpSync(join(app, "landing.mdx"), join(out, "index.mdx"));
execFileSync(process.execPath, [join(here, "openapi.mjs")], { stdio: "inherit" });
console.log(`docs: ${pages.size} pages synced`);
