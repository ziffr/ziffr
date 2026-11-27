// What of an email reply is read (spec 0004, spec 0064; GLOSSARY: Delivery, Correction): HTML as text, the words
// written now, and a "Correction:" line, case by case, and how long a long message may take.
import { parseReply } from "./connectors/types";
import { newText, noteFrom, stripHtml } from "./reply-cleaning";

describe("stripHtml", () => {
  it.each([
    ["12", "12"],
    ["<p>12</p><p>13</p>", "12\n13\n"],
    ["<div>a<br>b<br />c</div>", "a\nb\nc\n"],
    ["<b>12</b> deals", "12 deals"],
    ["<style>p { color: red }</style>12", "12"],
    ["1<SCRIPT type=x>let a = '<p>';</Script>2", "12"],
    ["<script>a</style>b</script>c", "c"],
    ["<script>a<style>b</style>c", "ac"],
    ["<style>a</style><style>b", "b"],
    ["a < b", "a < b"],
    ["a <> b", "a <> b"],
    ["<<b>>1", ">1"],
    ["<a href=x>1</a> < 2", "1 < 2"],
    ["&lt;12&gt;&nbsp;&amp;", "<12> &"],
    ["&amp;lt;", "<"],
  ])("%j reads as %j", (html, text) => {
    expect(stripHtml(html)).toBe(text);
  });
});

describe("newText", () => {
  it.each([
    ["12\r\n\r\nOn Tue, 3 Nov 2026, Ziffr <z@x> wrote:\r\n> 7", "12"],
    ["12\nOn Tue Ziffr wrote :  \nold", "12"],
    ["12\nam Di. schrieb Ziffr:\nold", "12"],
    ["12\nOn Tue wrote the team: old:\nold", "12"],
    ["12\nOn wrote:", "12\nOn wrote:"],
    ["12\nOn  wrote:", "12\nOn  wrote:"],
    ["12\nOn Tue Ziffr wrote", "12\nOn Tue Ziffr wrote"],
    ["12\nOn Tue Ziffr wrote: yes", "12\nOn Tue Ziffr wrote: yes"],
    ["12\nOn Tue Ziffr rewrote:", "12\nOn Tue Ziffr rewrote:"],
    ["12\nOn Tue Ziffr wrotex:", "12\nOn Tue Ziffr wrotex:"],
    ["12\nOnly Ziffr wrote:", "12\nOnly Ziffr wrote:"],
    ["12\n> 7", "12"],
    ["12\n-- \nAnn", "12"],
    ["12\n--  Original Message\nold", "12"],
    ["12\nFrom: Ziffr", "12"],
    ["From: the shop, 12", "From: the shop, 12"],
  ])("of %j is %j", (text, now) => {
    expect(newText(text)).toBe(now);
  });
});

describe("parseReply", () => {
  it.each([
    ["Fine by me", "Fine by me", null],
    ["Correction: 12", "", 12],
    ["  correction :  -1,200.5  ", "", -1200.5],
    ["Too low.\n\nCORRECTION: +1 200\nThanks", "Too low.\n\nThanks", 1200],
    ["Too low.\r\nCorrection:\r\n12", "Too low.\r\r\n12", 12],
    ["Correction:\n\n12\n\nThanks", "12\n\nThanks", 12],
    ["Correction: 12\n13", "13", 12],
    ["Correction: 12\r\n\r\n3 are missing", "3 are missing", 12],
    ["Correction:\u00a01\u202f200", "", 1200],
    ["Correction: .5", "", 0.5],
    ["Correction: 0", "", 0],
    ["Correction:\n0", "0", 0],
    // No number: the whole reply is its words and no value changes (#1350). None of these is a 0.
    ["Correction:\n\nthis looks wrong", "Correction:\n\nthis looks wrong", null],
    ["Correction: \nthis looks wrong", "Correction: \nthis looks wrong", null],
    ["Correction: \r\nthis looks wrong", "Correction: \r\nthis looks wrong", null],
    ["Correction:\n\n2026 was a bad year", "Correction:\n\n2026 was a bad year", null],
    ["Correction:\nsee below\n12", "Correction:\nsee below\n12", null],
    ["Correction:", "Correction:", null],
    ["Correction:   ", "Correction:", null],
    ["Correction:\n\n", "Correction:", null],
    ["Correction: \n\n", "Correction:", null],
    ["Correction: ,", "Correction: ,", null],
    ["Correction: , ,\nthanks", "Correction: , ,\nthanks", null],
    ["Correction: .", "Correction: .", null],
    ["Correction: -", "Correction: -", null],
    ["Correction: -\n12", "Correction: -\n12", null],
    ["Correction: x", "Correction: x", null],
    ["Correction: 12 deals", "Correction: 12 deals", null],
    ["Correction:\n12 deals", "Correction:\n12 deals", null],
    ["Correction: 1.2.3", "Correction: 1.2.3", null],
    ["Correction: x\nyes", "Correction: x\nyes", null],
    // A later line with a number still proposes it; an earlier one without stays in the words.
    ["Correction: 12 deals\nCorrection: 13", "Correction: 12 deals", 13],
    ["Correction:\nCorrection: 13", "Correction:", 13],
    ["A correction: 12", "A correction: 12", null],
    ["Correction 12", "Correction 12", null],
  ])("%j has the words %j and the Correction %j", (text, body, correction) => {
    expect(parseReply(text)).toEqual({ body, correction });
  });
});

describe("a long message is read quickly", () => {
  // The largest message taken is 1 MiB (inbound-email.ts).
  const SIZE = 1024 * 1024;
  const units = ["a", " ", "\n", "a ", "1 ", "<", ">", "<p>", "<br ", "<script ", "<style></script>", "On wrote ", " wrote:", "correction:\n", "correction: x\n", "correction: ,\n", "1\n", ", ", "> "];
  const starts = ["", "On ", "correction:", "correction: 1"];
  const inputs = starts.flatMap((start) => units.map((unit) => `${start}${unit.repeat(Math.ceil(SIZE / unit.length)).slice(0, SIZE)}x`));
  it.each([["stripHtml", stripHtml], ["newText", newText], ["parseReply", parseReply]] as const)("%s", (_name, read) => {
    for (const input of inputs) {
      const began = performance.now();
      read(input);
      expect(performance.now() - began).toBeLessThan(30_000);
    }
  }, 300_000);
});

describe("a note's hidden characters", () => {
  it("lose tag characters, which show nothing", () => {
    const tags = String.fromCodePoint(0xe0001, 0xe0069, 0xe0067, 0xe006e, 0xe007f);
    expect(noteFrom([`late${tags} order`])).toEqual({ text: "late order", cut: false });
    expect(noteFrom([tags])).toBeNull();
  });

  it("lose a lone zero-width space, and keep the joiners that words and emoji need", () => {
    const space = String.fromCodePoint(0x200b);
    expect(noteFrom([space])).toBeNull();
    expect(noteFrom([`de${space}als`])?.text).toBe("deals");
    const joined = `a${String.fromCodePoint(0x200c)}b${String.fromCodePoint(0x200d)}c`;
    expect(noteFrom([joined])?.text).toBe(joined);
  });
});
