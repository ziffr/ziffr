// Releases (ADR 0004): pure rules for turning waiting release notes (Changesets) into a version and a changelog
// section, and for reading a section back out. Kept free of files and git so it can be tested on its own.

const BUMPS = ["patch", "minor", "major"];

/** Reads one Changeset file: the bump it asks for (the largest named) and its note. Returns null for anything else. */
export function parseChangeset(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text.trim() + "\n");
  if (!m) return null;
  const bumps = [...m[1].matchAll(/^\s*["']?[^"':]+["']?\s*:\s*(patch|minor|major)\s*$/gm)].map((x) => x[1]);
  const note = m[2].trim().replace(/\s*\n\s*/g, " ");
  if (!bumps.length || !note) return null;
  return { bump: bumps.reduce((a, b) => (BUMPS.indexOf(b) > BUMPS.indexOf(a) ? b : a)), note };
}

/** The next version after `current` for the largest bump among the notes. Before 1.0 a major bump is refused. */
export function nextVersion(current, notes) {
  const [maj, min, pat] = current.split(".").map(Number);
  const bump = notes.reduce((a, n) => (BUMPS.indexOf(n.bump) > BUMPS.indexOf(a) ? n.bump : a), "patch");
  if (bump === "major" && maj === 0) throw new Error("A major bump before 1.0 needs a decision about the first public release (ADR 0004). Use minor.");
  if (bump === "major") return `${maj + 1}.0.0`;
  if (bump === "minor") return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

/** The day a version published on `day` becomes AGPL-3.0: three years later (LICENSE, Change Date). */
export function changeDate(day) {
  const [y, m, d] = day.split("-").map(Number);
  return `${y + 3}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** The changelog section for a release: self-hoster notes first, then what is new, fixes, and notes for developers. */
export function renderSection(version, day, notes) {
  const audience = (n, who) => new RegExp(`^${who}:\\s*`, "i").test(n.note);
  const plain = (n, who) => {
    const note = n.note.replace(new RegExp(`^${who}:\\s*`, "i"), "");
    return { ...n, note: note.charAt(0).toUpperCase() + note.slice(1) };
  };
  const selfHost = notes.filter((n) => audience(n, "Self-hosters")).map((n) => plain(n, "Self-hosters"));
  const devs = notes.filter((n) => audience(n, "Developers")).map((n) => plain(n, "Developers"));
  const people = notes.filter((n) => !audience(n, "Self-hosters") && !audience(n, "Developers"));
  const group = (title, list) => (list.length ? [`### ${title}`, "", ...list.map((n) => `- ${n.note}`), ""] : []);
  return [
    `## ${version} (${day})`,
    "",
    ...group("For self-hosters", selfHost),
    ...group("New and changed", people.filter((n) => n.bump !== "patch")),
    ...group("Fixed", people.filter((n) => n.bump === "patch")),
    ...group("For developers", devs),
    `This version becomes available under AGPL-3.0 on ${changeDate(day)}.`,
    "",
  ].join("\n");
}

/** Puts a new section on top of the released ones, below the changelog's introduction. */
export function insertSection(changelog, section) {
  const at = changelog.search(/^## /m);
  return at === -1 ? `${changelog.trimEnd()}\n\n${section}` : `${changelog.slice(0, at)}${section}\n${changelog.slice(at)}`;
}

/** The text of one version's section, exactly as the changelog has it: the GitHub release is made from this. */
export function sectionOf(changelog, version) {
  const lines = changelog.split("\n");
  const start = lines.findIndex((l) => l.startsWith(`## ${version} `) || l === `## ${version}`);
  if (start === -1) return null;
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end === -1) end = lines.length;
  return lines.slice(start + 1, end).join("\n").trim() + "\n";
}

/** The Docker files (spec 0015) with the new version: the image docker/compose.yml starts, and the release
 * docker/install.sh downloads compose.yml from. Nothing else in them changes. */
export function setDockerVersion(text, version) {
  return text
    .replace(/(ghcr\.io\/ziffr\/ziffr:)\d+\.\d+\.\d+/g, `$1${version}`)
    .replace(/^(ZIFFR_VERSION=)\d+\.\d+\.\d+$/m, `$1${version}`);
}
