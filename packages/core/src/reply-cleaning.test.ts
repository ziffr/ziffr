// What of an email reply is read (spec 0004, spec 0064; GLOSSARY: Delivery, Correction): HTML as text, the words
// written now, and a "Correction:" line, case by case, and how long a long message may take.
import { parseReply } from "./connectors/types";
import { newText, stripHtml } from "./reply-cleaning";

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
    ["Correction: 12 deals", "", null],
    ["Correction: 12 deals\nCorrection: 13", "Correction: 13", 13],
    ["Correction: 1.2.3", "", null],
    ["Correction: x", "", null],
    ["Correction:", "", null],
    ["A correction: 12", "A correction: 12", null],
    ["Correction 12", "Correction 12", null],
  ])("%j has the words %j and the Correction %j", (text, body, correction) => {
    expect(parseReply(text)).toEqual({ body, correction });
  });
});

describe("a long message is read quickly", () => {
  // The largest message taken is 1 MiB (inbound-email.ts).
  const SIZE = 1024 * 1024;
  const units = ["a", " ", "\n", "a ", "1 ", "<", ">", "<p>", "<br ", "<script ", "<style></script>", "On wrote ", " wrote:", "correction:\n", "correction: x\n", "> "];
  const starts = ["", "On ", "correction:"];
  const inputs = starts.flatMap((start) => units.map((unit) => `${start}${unit.repeat(Math.ceil(SIZE / unit.length)).slice(0, SIZE)}x`));
  it.each([["stripHtml", stripHtml], ["newText", newText], ["parseReply", parseReply]] as const)("%s", (_name, read) => {
    for (const input of inputs) {
      const began = performance.now();
      read(input);
      expect(performance.now() - began).toBeLessThan(6000);
    }
  });
});
