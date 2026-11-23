// The reference for the tree of a Breakdown (spec 0041, ticket 12; GLOSSARY: Breakdown). Written apart from breakdown-tree.ts:
// - the rows are a plain nested structure; every value is read exactly from its text (exact.ts in this folder);
// - a box's share among its siblings is its size over the sum of their sizes, exactly (the sizes include a group's total size);
// - a box is given to the largest row (ties: the one first in tree order) whose parent has one, as long as the boxes, counting one
//   "Other rows" box for each box that has a row left out, stay within the limit; the count is made from scratch each time, and the
//   search starts again after each box is given;
// - a group's number is the exact sum of the rows left out, its size the sum of their sizes;
// - a row whose parts add up to another number than its own is listed, with both numbers.
import { exactOf, plus, ZERO, same, type Exact } from "./exact";

/** A row as the reference holds it: a label, a value and its parts. */
export type RefRow = { label: string; value: number; parts?: RefRow[] };
/** One box the reference finds, in tree order: the label, the exact value and share, the level (0 for the top box) and the index of the box above. */
export type RefBreakdownBox = { label: string; level: number; parent: number | null; value: Exact; share: Exact | null; others: string[] | null };

const abs = (x: Exact): Exact => (x.num < 0n ? { num: -x.num, den: x.den } : x);

type Node = { label: string; value: Exact; kids: Node[]; parent: Node | null; at: number };

/** The boxes for a Breakdown whose top box is `total` (or the rows added up when it is null), within `limit` boxes; and the rows whose parts add up to another number than their own. */
export function referenceBreakdown(name: string, total: number | null, rows: RefRow[], limit = 24): { boxes: RefBreakdownBox[]; differing: { label: string; own: Exact; parts: Exact }[] } {
  const all: Node[] = [];
  const build = (list: RefRow[], parent: Node | null): Node[] => list.map((r) => {
    const n: Node = { label: r.label, value: exactOf(r.value), kids: [], parent, at: all.length };
    all.push(n);
    n.kids = build(r.parts ?? [], n);
    return n;
  });
  const top = build(rows, null);
  const sum = (ns: Exact[]) => ns.reduce(plus, ZERO);
  const rootValue = total === null ? sum(top.map((n) => n.value)) : exactOf(total);

  const kept = new Set<Node>();
  const boxCount = (k: Set<Node>) => {
    // The top box, each kept row, and an "Other rows" box for the top box and each kept row that has a row left out.
    const owners: (Node | null)[] = [null, ...k];
    const withLeft = owners.filter((o) => (o === null ? top : o.kids).some((c) => !k.has(c))).length;
    return 1 + k.size + withLeft;
  };
  for (;;) {
    const eligible = all.filter((n) => !kept.has(n) && (n.parent === null || kept.has(n.parent)));
    eligible.sort((a, b) => {
      const [x, y] = [abs(a.value), abs(b.value)];
      const d = x.num * y.den - y.num * x.den;
      return d > 0n ? -1 : d < 0n ? 1 : a.at - b.at;
    });
    const next = eligible.find((n) => boxCount(new Set([...kept, n])) <= limit);
    if (!next) break;
    kept.add(next);
  }

  const boxes: RefBreakdownBox[] = [];
  const place = (label: string, value: Exact, level: number, parent: number | null, size: Exact, siblings: Exact, others: string[] | null, kids: Node[]) => {
    const id = boxes.length;
    boxes.push({ label, level, parent, value, share: parent === null || siblings.num === 0n ? null : { num: size.num * siblings.den, den: size.den * siblings.num }, others });
    const shown = kids.filter((k) => kept.has(k));
    const left = kids.filter((k) => !kept.has(k));
    const units = shown.map((k) => ({ node: k, size: abs(k.value) }));
    const group = left.length ? { size: sum(left.map((k) => abs(k.value))) } : null;
    const total2 = sum([...units.map((u) => u.size), ...(group ? [group.size] : [])]);
    for (const u of units) place(u.node.label, u.node.value, level + 1, id, u.size, total2, null, u.node.kids);
    if (group) place(`Other rows (${left.length})`, sum(left.map((k) => k.value)), level + 1, id, group.size, total2, left.map((k) => k.label), []);
  };
  place(name, rootValue, 0, null, ZERO, ZERO, null, top);

  const differing: { label: string; own: Exact; parts: Exact }[] = [];
  const check = (label: string, own: Exact, kids: Node[]) => {
    if (kids.length && !same(own, sum(kids.map((k) => k.value)))) differing.push({ label, own, parts: sum(kids.map((k) => k.value)) });
  };
  const walk = (label: string, own: Exact, kids: Node[]) => {
    check(label, own, kids);
    // Only rows that have a box are named, in tree order, as the drawing is.
    for (const k of kids) if (kept.has(k)) walk(k.label, k.value, k.kids);
  };
  walk(name, rootValue, top);
  return { boxes, differing };
}
