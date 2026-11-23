// Breakdown parents (GLOSSARY: Breakdown; spec 0041, ticket 12): the one reader of which row of a Breakdown is the
// parent of which, so the Workspace Export file, a pasted breakdown, a program's request and the database's guard agree.
// Pure, no code and no dependencies, so a program that writes a file Ziffr reads can run the same check.
//
// A row names its parent by NAME, the label of another row of the same Breakdown; a name is the same however it is
// typed in case, spacing at the ends or Unicode form (as a label is matched when values are added up). A name is not
// a path: names have to be unique in a Breakdown that has parents, so a name cannot be ambiguous and is never guessed.
// An empty or missing parent is a top-level row. A parent may come later in the list than its part.
//
// Refused, in words (nothing is drawn, recorded or repaired from a list that is refused):
// - more than 200 rows, or a row 5 levels down (the limits the database holds too, whatever wrote the row);
// - a row that is its own parent, or rows that are each other's ancestors;
// - a parent that is no row of the list (a name that is not there, or another Breakdown's row, which a name cannot reach);
// - a name used twice, a name or a parent with a control character, and a name over 200 characters.

/** How big a Breakdown with parents may be: rows in all, and levels from the top row as 1. */
export const BREAKDOWN_PARENTS = { rows: 200, depth: 4, name: 200 } as const;

/** What a row of a Breakdown is as far as its parent goes: its name and the name of its parent, if it says one. */
export type PartRow = { label: string; parent?: string | null };

/** The parents read: for each row (in the order given) the index of its parent row or null, and the rows parents first (an order a database can insert them in). */
export type ParentsRead = { ok: true; parents: (number | null)[]; order: number[]; levels: number[] } | { ok: false; problem: string };

/** A name as rows are matched by it: the same in any case, with its ends trimmed and in one Unicode form. */
export const nameKey = (name: string): string => name.normalize("NFC").trim().toLowerCase();

// Control characters of every kind, and the separators of lines and paragraphs: a name is one line of plain text.
const CONTROL = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/;
const TOTAL = /^(total|gesamt|summe|sum)$/i;
// A name, shortened for a sentence.
const quoted = (s: string) => `“${[...s].length > 40 ? `${[...s].slice(0, 39).join("")}…` : s}”`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Whether any row names a parent: a Breakdown without parents stays flat and is checked by none of this. */
export const hasParents = (rows: readonly PartRow[]): boolean => rows.some((r) => typeof r.parent === "string" && r.parent.trim() !== "");

/**
 * Reads the parents of a Breakdown's rows, or says in words what is wrong. A list in which no row names a parent is
 * flat and always reads (every parent null, in order). Otherwise every limit above holds or the whole list is refused.
 */
export function readParents(rows: readonly PartRow[]): ParentsRead {
  const no = (problem: string): ParentsRead => ({ ok: false, problem });
  const n = rows.length;
  if (!hasParents(rows)) return { ok: true, parents: rows.map(() => null), order: rows.map((_, i) => i), levels: rows.map(() => 1) };
  if (n > BREAKDOWN_PARENTS.rows) return no(`A breakdown with parents has at most ${BREAKDOWN_PARENTS.rows} rows; this one has ${n}.`);
  const keys = rows.map((r) => nameKey(r.label));
  const first = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const label = rows[i].label;
    if (CONTROL.test(label)) return no(`The name ${quoted(label.replace(CONTROL, " "))} has a character that is not text (a line break or another control character).`);
    if ([...label].length > BREAKDOWN_PARENTS.name) return no(`The name ${quoted(label)} has more than ${BREAKDOWN_PARENTS.name} characters.`);
    if (first.has(keys[i])) return no(`${quoted(label)} is the name of two rows, so a row cannot name it as its parent. In a breakdown with parents every row has a name of its own.`);
    first.set(keys[i], i);
  }
  const parents: (number | null)[] = [];
  for (let i = 0; i < n; i++) {
    const given = rows[i].parent;
    const text = typeof given === "string" ? given.trim() : "";
    if (text === "") { parents.push(null); continue; }
    if (CONTROL.test(text)) return no(`The parent of ${quoted(rows[i].label)} has a character that is not text (a line break or another control character).`);
    if ([...text].length > BREAKDOWN_PARENTS.name) return no(`The parent of ${quoted(rows[i].label)} has more than ${BREAKDOWN_PARENTS.name} characters.`);
    const at = first.get(nameKey(text));
    if (at === undefined) {
      return no(TOTAL.test(text)
        ? `${quoted(rows[i].label)} names “${text}” as its parent, but a total is not a row of the breakdown. Leave the parent empty for a row at the top.`
        : `${quoted(rows[i].label)} names ${quoted(text)} as its parent, but no row of the breakdown has that name.`);
    }
    if (at === i) return no(`${quoted(rows[i].label)} is its own parent.`);
    parents.push(at);
  }
  // Levels from the top (1), found by walking up; a walk longer than the rows there are is a cycle.
  const levels: number[] = [];
  for (let i = 0; i < n; i++) {
    let level = 1;
    let at = parents[i];
    while (at !== null) {
      level++;
      // After n steps up, a row that has a cycle above it is standing in the cycle: that is the row to name.
      if (level > n) return no(`${quoted(rows[at].label)} is among its own parents: rows cannot be each other's ancestors.`);
      at = parents[at];
    }
    levels.push(level);
  }
  const deepest = levels.indexOf(Math.max(...levels));
  if (levels[deepest] > BREAKDOWN_PARENTS.depth) return no(`${quoted(rows[deepest].label)} is ${plural(levels[deepest], "level")} down; a breakdown has at most ${BREAKDOWN_PARENTS.depth} levels.`);
  // Parents first, and rows of one level in the order given.
  const order = rows.map((_, i) => i).sort((a, b) => levels[a] - levels[b] || a - b);
  return { ok: true, parents, order, levels };
}
