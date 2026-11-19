// Releases (ADR 0004, ADR 0014): pure rules for turning the release notes (Changesets) added since the last release
// into the next version and the text of its GitHub release. Kept free of files and git so it can be tested on its own.

const BUMPS = ["patch", "minor", "major"];
/** A release tag: `vX.Y.Z`, nothing before or after. */
const RELEASE_TAG = /^v(\d+\.\d+\.\d+)$/;

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

/** Notes grouped as a release shows them: self-hoster notes first, then what is new, fixes, and notes for
 * developers, each under a `### ` heading; lines ending in a blank line. */
function renderGroups(notes) {
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
    ...group("For self-hosters", selfHost),
    ...group("New and changed", people.filter((n) => n.bump !== "patch")),
    ...group("Fixed", people.filter((n) => n.bump === "patch")),
    ...group("For developers", devs),
  ];
}

/** The text of a GitHub release: self-hoster notes first, then what is new, fixes, and notes for developers, and the
 * day the version becomes AGPL-3.0. The same grouping as the sections of CHANGELOG.md up to 0.11.0. */
export function renderNotes(day, notes) {
  return [...renderGroups(notes), `This version becomes available under AGPL-3.0 on ${changeDate(day)}.`, ""].join("\n");
}

/** The next release after the tag `previous`, from the Changeset files added since it (`files` are `{ name, text }`).
 * Refuses when nothing was added, or when a file is not a release note: the release must not drop one silently. */
export function nextRelease({ previous, files, day }) {
  const current = RELEASE_TAG.exec(previous)?.[1];
  if (!current) throw new Error(`${previous} is not a release tag like v0.11.0.`);
  if (!files.length) throw new Error(`No release notes were added to .changeset/ since ${previous}: nothing to release.`);
  const notes = files.map(({ name, text }) => {
    const n = parseChangeset(text);
    if (!n) throw new Error(`${name} is not a release note (see .changeset/README.md).`);
    return n;
  });
  const version = nextVersion(current, notes);
  return { previous, version, tag: `v${version}`, notes: renderNotes(day, notes), count: notes.length };
}

/** Which of the paths a diff lists are release notes: Markdown files directly in `.changeset/`, but not its README. */
export function changesetPaths(paths) {
  return paths.filter((p) => /^\.changeset\/[^/]+\.md$/.test(p) && p !== ".changeset/README.md");
}

/** The text of the rolling Preview pre-release: what main holds beyond the last release. The waiting notes, grouped
 * like a release under the version they would make, then every commit since that release, newest first.
 * `commits` are `{ sha, subject }`; `repo` is `owner/name`. */
export function renderPreview({ notes, next, since, commits, repo, day }) {
  const lines = [
    `What \`main\` holds on ${day}, beyond ${since}: not a release, and replaced with every merge. To run Ziffr, use the [latest release](https://github.com/${repo}/releases/latest).`,
    "",
    `## Coming in ${next}`,
    "",
    ...(notes.length ? renderGroups(notes) : ["Nothing people use or run has changed yet.", ""]),
    `## Every change since ${since}`,
    "",
    ...(commits.length ? commits.map((c) => `- ${c.subject} ([${c.sha.slice(0, 7)}](https://github.com/${repo}/commit/${c.sha}))`) : ["None yet."]),
    "",
  ];
  return lines.join("\n");
}

/** The Docker files (spec 0015) as a release attaches them: `docker/compose.yml` starts the image of `version` and
 * `docker/install.sh` downloads that release's compose file. On main they name a placeholder; nothing else changes.
 * Throws if the file has no version to set, so a renamed line cannot ship a release that starts the wrong image. */
export function setDockerVersion(text, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`${version} is not a version.`);
  const out = text
    .replace(/(ghcr\.io\/ziffr\/ziffr:)(?:main|\d+\.\d+\.\d+(?:-[\w.]+)?)\b/g, `$1${version}`)
    .replace(/^(ZIFFR_VERSION=)\S+$/m, `$1${version}`);
  if (out === text) throw new Error("No version to set in this file.");
  return out;
}
