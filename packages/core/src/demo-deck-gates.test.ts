// Every path that writes a deck or a Snapshot passes the demo's gates for a visitor, before its first write (GLOSSARY: Demo
// Mode, Deck, Snapshot; spec 0051, ticket 10): the seed's decks and Snapshots are refused, the words and shapes of a deck go
// through the rules, a Snapshot is taken only with the demo's turn and within its size. Without a database the paths are read
// from the source, as demo-widget-gates.test.ts does for widgets: a writer that does not name its gate, or names it after its
// first write, fails here; a new writer must be added to this list or it fails too.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = (f: string) => readFileSync(join(__dirname, f), "utf8");
/** The text of one top-level function, from its declaration to the next one. */
function body(file: string, name: string): string {
  const s = src(file);
  const m = new RegExp(`(?:export )?(?:async )?function ${name}\\(`).exec(s);
  expect(m, `${file} has no ${name}`).not.toBeNull();
  const next = s.slice(m!.index + 10).search(/\n(?:export )?(?:async )?function |\n\/\*\*/);
  return s.slice(m!.index, next < 0 ? undefined : m!.index + 10 + next);
}
/** The place of the first write in a function: a row written, a Version recorded, a lease or a sequence taken, an Audit event. */
const WRITES = [".insert(", ".update(", ".delete(", "ensureBaseline(", "recordVersion(", "reserveIds(", "audit(", "store("];
const firstWrite = (b: string) => Math.min(...WRITES.map((w) => (b.includes(w) ? b.indexOf(w) : Infinity)));
/** That `gate` is named in the function and comes before its first write. */
function gatedBefore(file: string, fn: string, gate: string) {
  const b = body(file, fn);
  const at = b.indexOf(gate);
  expect(at, `${fn} must call ${gate}`).toBeGreaterThan(-1);
  expect(at, `${fn}: ${gate} must come before the first write`).toBeLessThan(firstWrite(b));
}

describe("every writer of a deck in decks.ts", () => {
  it("refuses the seed's decks before it writes", () => {
    for (const fn of ["saveDeck", "renameDeck", "deleteDeck", "setDeckFooter", "setDeckTheme"]) gatedBefore("decks.ts", fn, 'refuseSeeded(actor, "decks", id)');
  });

  it("puts a visitor's document through the deck gate (words, shapes, size) before the save, and its names and footer through the text rules", () => {
    gatedBefore("decks.ts", "saveDeck", "visitorDeckDocument(");
    expect(body("decks.ts", "saveDeck")).toContain("document = await visitorDeckDocument(");
    expect(body("decks.ts", "renameDeck")).toContain("deckName(actor, name)");
    expect(body("decks.ts", "createDeck")).toContain("deckName(actor, name, opts.derived)");
    gatedBefore("decks.ts", "setDeckFooter", "visitorOptionalText(");
    expect(body("decks.ts", "deckName")).toContain("visitorOptionalText(");
  });

  it("names its writers, so a new one fails here until it is gated or says why it is not", () => {
    const writers = [...src("decks.ts").matchAll(/from\("decks"\)\.(?:insert|update|delete)\(/g)].length;
    // createDeck (insert), saveDeck, renameDeck, setDeckFooter, setDeckTheme (update), deleteDeck (delete): one write each.
    expect(writers).toBe(6);
  });
});

describe("what makes a deck, or puts onto one, besides decks.ts", () => {
  it("names a deck after what exists already only through createDeck's derived name, and a typed name through the rules", () => {
    expect(body("deck-templates.ts", "createDeckFromTemplate")).toContain("{ derived: !given }");
    expect(body("deck-additions.ts", "newDeckFor")).toContain("{ derived: true }");
  });

  it("refuses to add to the seed's deck before the editor tries to save it", () => {
    gatedBefore("deck-additions.ts", "deckAddition", 'refuseSeeded(actor, "decks", deckId)');
  });

  it("puts the shapes of a slide layout through the deck's words and shapes rules before it is stored", () => {
    const b = body("templates.ts", "saveSlideLayout");
    expect(b).toContain("visitorSlideShapes(actor, input.shapes)");
    expect(b.indexOf("visitorSlideShapes(")).toBeLessThan(b.indexOf("store("));
    // A Deck Template is built from the deck as stored, which passed the gate when it was saved.
    expect(body("templates.ts", "saveDeckTemplate")).toContain("storedSlides(deck.document)");
    expect(body("templates.ts", "store")).toContain("visitorSize(");
  });

  it("lets a visitor name, save and restore a deck's Versions, and refuses the seed's before it writes", () => {
    expect(src("demo-visitor-words.ts")).toMatch(/VISITOR_VERSION_TYPES[^\n]*"deck"/);
    expect(body("version-history.ts", "refuseSeededRestore")).toContain('refuseSeeded(actor, "decks", id)');
    gatedBefore("version-history.ts", "saveNamedVersion", 'refuseSeeded(actor, "decks", id)');
    expect(body("version-history.ts", "restoreVersion")).toContain("refuseSeededRestore(");
    expect(body("version-history.ts", "restoreVersion").indexOf("refuseSeededRestore(")).toBeLessThan(body("version-history.ts", "restoreVersion").indexOf(".update("));
  });
});

describe("every writer of a Snapshot in snapshots.ts", () => {
  it("is taken only with the demo's turn, never of the showcase, and within its size, each before the write that holds it", () => {
    gatedBefore("snapshots.ts", "takeSnapshot", "assertSnapshotTurn(actor, opts.turn)");
    gatedBefore("snapshots.ts", "takeSnapshot", 'refuseShowcase(actor, "dashboard", dashboardId)');
    const b = body("snapshots.ts", "takeSnapshot");
    // Refused before the numbers are computed, which is the expensive part.
    expect(b.indexOf("assertSnapshotTurn(")).toBeLessThan(b.indexOf("snapshotWidgets(actor"));
    expect(b.indexOf("refuseShowcase(")).toBeLessThan(b.indexOf("getCanvasData("));
    expect(b).toContain("DEMO_SNAPSHOT_LIMITS.frozenBytes");
    expect(b.indexOf("DEMO_SNAPSHOT_LIMITS.frozenBytes")).toBeLessThan(b.indexOf('.from("dashboard_snapshots").insert('));
  });

  it("refuses the seed's Snapshots before it writes their words, shows them or deletes them", () => {
    for (const fn of ["editSnapshotWords", "showSnapshot", "deleteSnapshot"]) gatedBefore("snapshots.ts", fn, 'refuseSeeded(actor, "dashboard_snapshots", snapshotId)');
  });

  it("puts a visitor's Snapshot words through the text rules, asking only for the words that changed", () => {
    expect(body("snapshots.ts", "cleanWords")).toContain("visitorOptionalText(");
    expect(body("snapshots.ts", "cleanWords")).toContain("text !== (before ?? \"\")");
    expect(body("snapshots.ts", "editSnapshotWords")).toContain("cleanWords(actor, words,");
  });

  it("names its writers, so a new one fails here until it is gated or says why it is not", () => {
    const writers = [...src("snapshots.ts").matchAll(/from\("dashboard_snapshots"\)\.(?:insert|update|delete)\(/g)].length;
    // takeSnapshot (insert), editSnapshotWords (two updates), showSnapshot, deleteSnapshot: one each, the edit's second after its first.
    expect(writers).toBe(5);
  });
});

describe("the web app's actions that run these writers", () => {
  const web = (f: string) => readFileSync(join(__dirname, "../../../apps/web/src/app", f), "utf8");
  it("run each opened one in attemptAsVisitor, and take a Snapshot only through the turn", () => {
    for (const [file, op] of [
      ["deck-actions.ts", "deck-actions:createDeck"], ["deck-actions.ts", "deck-actions:saveDeck"], ["deck-actions.ts", "deck-actions:renameDeck"], ["deck-actions.ts", "deck-actions:setDeckFooter"], ["deck-actions.ts", "deck-actions:deleteDeck"],
      ["convert-actions.ts", "convert-actions:makeDeck"], ["convert-actions.ts", "convert-actions:makeDeckFromSnapshot"], ["convert-actions.ts", "convert-actions:addToDeck"], ["convert-actions.ts", "convert-actions:addSnapshotToDeck"],
      ["deck-workflow-template-actions.ts", "deck-workflow-template-actions:createDeckFromTemplate"], ["deck-workflow-template-actions.ts", "deck-workflow-template-actions:saveAsDeckTemplate"],
      ["template-actions.ts", "template-actions:saveSlideLayout"], ["theme-actions.ts", "theme-actions:setDeckTheme"],
      ["snapshot-actions.ts", "snapshot-actions:takeSnapshot"], ["snapshot-actions.ts", "snapshot-actions:editSnapshotWords"], ["snapshot-actions.ts", "snapshot-actions:showSnapshot"], ["snapshot-actions.ts", "snapshot-actions:deleteSnapshot"],
    ]) expect(web(file), op).toContain(`attemptAsVisitor("${op}"`);
    const take = web("snapshot-actions.ts");
    // A Snapshot certain to fail at the write is refused before the turn is taken, and again before the numbers are computed.
    expect(take.indexOf("assertSnapshotRoom(")).toBeGreaterThan(-1);
    expect(take.indexOf("assertSnapshotRoom(")).toBeLessThan(take.indexOf("withSnapshotTurn(actor"));
    expect(body("snapshots.ts", "takeSnapshot").indexOf("assertSnapshotRoom(")).toBeLessThan(body("snapshots.ts", "takeSnapshot").indexOf("getCanvasData("));
    // Every deck save is charged by its bytes before it is made.
    const save = web("deck-actions.ts");
    expect(save.indexOf("chargeDeckSave(")).toBeGreaterThan(-1);
    expect(save.indexOf("chargeDeckSave(")).toBeLessThan(save.indexOf("decks.saveDeck("));
    expect(take).toContain("withSnapshotTurn(actor, who,");
    expect(take).toContain("{ turn }");
  });
});
