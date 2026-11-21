// Keeps the user guide's screen chapters in step with the screens (docs/user-guide/README.md). Each chapter names the
// files of the screens it describes in a `<!-- screens: … -->` line. From that, this module tells which pages no chapter
// describes, which named paths no longer exist, and which chapters a change to the app should have updated.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

/** The guide's folder, relative to the repository root. */
export const GUIDE_DIR = "docs/user-guide";

/** Pages that are no screen of their own, each with its kind and reason, kept in guide-not-screens.json. Everything
 * else under apps/web/src/app needs a chapter that names it. */
export const NOT_SCREENS = Object.fromEntries(
  Object.entries(JSON.parse(readFileSync(new URL("./guide-not-screens.json", import.meta.url), "utf8"))).filter(([k]) => !k.startsWith("_")),
);

/** Problems with the allow-list: entries with no kind or reason, pages that no longer exist, or pages a chapter names
 * anyway (then the entry is dead weight). */
export function badNotScreens(root, chapters = readChapters(root)) {
  const kinds = JSON.parse(readFileSync(new URL("./guide-not-screens.json", import.meta.url), "utf8"))._kinds;
  const pages = listFiles(root, "apps/web/src/app").filter((f) => f.endsWith("/page.tsx"));
  return Object.entries(NOT_SCREENS).flatMap(([file, e]) => {
    if (!kinds.includes(e.kind) || !e.reason?.trim()) return [`${file}: needs a kind (${kinds.join(", ")}) and a reason`];
    if (!pages.includes(file)) return [`${file}: is no page any more, remove it`];
    if (chapters.some((c) => covers(c, file))) return [`${file}: a chapter names it, remove it from the list`];
    return [];
  });
}

const CHAPTER = /^\d+-[a-z0-9-]+\.md$/;
const SCREENS = /^<!--\s*screens:\s*([\s\S]*?)-->/m;

/** A path pattern as a regular expression: `*` is anything within one folder, `**` anything across folders. */
export function globToRegExp(glob) {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      // `a/**` is a and everything below it; `**/b` is b in any folder.
      if (glob[i + 2] === "/") { out += "(?:.*/)?"; i += 2; } else { out += ".*"; i += 1; }
    } else if (c === "*") out += "[^/]*";
    else out += c.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${out}$`);
}

/** The paths a chapter's `<!-- screens: … -->` line names, or none. */
export function screensOf(markdown) {
  const m = SCREENS.exec(markdown);
  return m ? m[1].split(/[,\n]/).map((s) => s.trim()).filter(Boolean) : [];
}

/** Every chapter of the guide with the paths it names, read from the repository at `root`. */
export function readChapters(root) {
  const dir = path.join(root, GUIDE_DIR);
  return readdirSync(dir).filter((f) => CHAPTER.test(f)).sort().map((f) => ({
    file: `${GUIDE_DIR}/${f}`,
    screens: screensOf(readFileSync(path.join(dir, f), "utf8")),
  }));
}

/** Every file below `dir` (relative to `root`), as paths relative to `root`. */
export function listFiles(root, dir) {
  const out = [];
  const walk = (rel) => {
    for (const name of readdirSync(path.join(root, rel))) {
      const p = `${rel}/${name}`;
      if (statSync(path.join(root, p)).isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** Whether a file is one of the chapter's screens. */
const covers = (chapter, file) => chapter.screens.some((g) => globToRegExp(g).test(file));

/** Pages of the app that no chapter describes and that are not listed as no screen of their own. */
export function uncoveredPages(root, chapters = readChapters(root)) {
  return listFiles(root, "apps/web/src/app")
    .filter((f) => f.endsWith("/page.tsx") && !(f in NOT_SCREENS))
    .filter((f) => !chapters.some((c) => covers(c, f)));
}

/** Paths named by a chapter that match no file any more, as "chapter: path". */
export function staleScreens(root, chapters = readChapters(root)) {
  const files = listFiles(root, "apps/web/src");
  return chapters.flatMap((c) => c.screens.filter((g) => !files.some((f) => globToRegExp(g).test(f))).map((g) => `${c.file}: ${g}`));
}

/** For a change to the files `changed`, each chapter that describes one of them but was not changed with it. Tests
 * describe no screen, so a change to a test alone asks for nothing. */
export function chaptersToUpdate(changed, chapters) {
  const screens = changed.filter((f) => !/\.test\.tsx?$/.test(f));
  return chapters
    .filter((c) => !changed.includes(c.file))
    .map((c) => ({ chapter: c.file, files: screens.filter((f) => covers(c, f)) }))
    .filter((c) => c.files.length);
}
