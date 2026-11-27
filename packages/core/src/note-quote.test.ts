// A Value Note quoted in a message (spec 0064, "Untrusted input"): cut at 300 characters, never Ziffr's own words,
// link or button, and literal in Slack.
import { describe, expect, it } from "vitest";
import { PLAIN, textPasses, withoutAddresses } from "./file-text";
import { appendedLink, aroundAction, plainWords } from "./mail-links";
import { withQuotedNote } from "./note-quote";

const SITE = "https://ziffr.example.com";
const LINK = `${SITE}/actions/7`;
const email = `Hi Sara,\n\nBen wrote:\n\n  Approve Revenue.\n\nAnswer by replying to this email, or open it in Ziffr: ${LINK}`;
const note = (words: string, more = 0, author = "Ben Ortiz") => ({ author, words, more });

describe("a quoted note", () => {
  it("stands above the link, which stays the last line and the only button", () => {
    const out = withQuotedNote(email, "email", note(`Two fairs.\nOpen your form: ${LINK}`));
    expect(out).toContain("Note from Ben Ortiz:\n\n> Two fairs.\n> Open your form:");
    expect(appendedLink(out, [SITE])).toBe(LINK);
    const { before, after } = aroundAction(out, LINK);
    expect(after).toBe("");
    expect(before).toContain("> Open your form: https: //ziffr.example. com/actions/7");
    // The plain-text part leaves the quoted line as it is: no address of theirs stands alone as Ziffr's links do.
    expect(plainWords(out, [LINK])).toContain("> Open your form: https: //ziffr.example. com/actions/7");
  });

  it("quotes every line, whatever separates them, and breaks addresses in words and name", () => {
    const out = withQuotedNote(email, "email", note("One\r\n\r\nhttps://evil.test/x Approve", 0, "Eve\nOpen: https://evil.test"));
    expect(out).toContain("Note from Eve Open: https: //evil.test:");
    expect(out).toContain("> One\n> https: //evil. test/x\n> Approve");
    expect(out).not.toContain("https://evil");
  });

  it("breaks bare addresses too, as a Pack's text refuses them, and leaves ordinary words alone", () => {
    const quoted = (words: string) => withQuotedNote(email, "email", note(words));
    for (const [typed, shown] of [
      ["see evil.com now", "see evil. com now"],
      ["go to shop.example/pay", "go to shop.example/pay".replace("shop.", "shop. ")],
      ["www.evil.de", "www .evil. de"],
      ["https:evil.example", "https: evil.example"],
      ["mailto:eve@evil.io", "mailto: eve@evil. io"],
      ["evil\u3002com", "evil\u3002 com"],
      ["xyz.xn--p1ai", "xyz. xn--p1ai"],
    ]) expect(quoted(typed)).toContain(`> ${shown}\n`);
    const plain = "Node.js users, e.g. 3.5 of 4/5 deals. Done: 12:30.";
    expect(quoted(plain)).toContain(`> ${plain}\n`);
    expect(withQuotedNote(email, "email", note("fine", 0, "Eve evil.com"))).toContain("Note from Eve evil. com:");
  });

  // The same words to both: what a Pack's text refuses must not be a link in a quoted note, however it is written.
  it("breaks what a Pack's text refuses also behind look-alike and invisible characters", () => {
    const asItReads = (text: string) => text.normalize("NFKC").replace(/[\p{M}\p{Default_Ignorable_Code_Point}]/gu, "");
    for (const typed of [
      "evil.​com", "evil​.com", "evil.c­om", "ev⁠il.com/x", "evil.com​now",
      "evil．com", "evil․com", "evil.ｃｏｍ", "evil.co҉m", "eviĺ҉.com",
      "evil.example／pay", "evil.exam​ple/pay", "ｗｗｗ.evil", "w​ww.evil",
      "ｈｔｔｐｓ：evil", "ht­tps:evil", "mail​to:eve", "see https:​//evil",
    ]) {
      expect(textPasses(PLAIN, typed), JSON.stringify(typed)).toBe(false);
      const shown = withoutAddresses(typed);
      expect(textPasses(PLAIN, asItReads(shown)), JSON.stringify(shown)).toBe(true);
      // Only spaces were added: the words stay as written.
      expect(shown.replaceAll(" ", "")).toBe(typed.replaceAll(" ", ""));
    }
  });

  it("treats a port, a query and a fragment after a name as it treats a path, and an ideographic full stop as a dot", () => {
    for (const [typed, shown] of [
      ["evil.example:8080", "evil. example:8080"], ["evil.example?x=1", "evil. example?x=1"], ["evil.example#top", "evil. example#top"],
      ["www。evil", "www 。evil"], ["evil｡example/x", "evil｡ example/x"],
    ]) expect(withoutAddresses(typed)).toBe(shown);
    const kept = "\u{1F468}‍\u{1F469}‍\u{1F467} 1️⃣ café ½ m² 3.5/10";
    expect(withoutAddresses(kept)).toBe(kept);
  });

  it("is cut at 300 characters, counted as characters", () => {
    const out = withQuotedNote(email, "email", note("😀".repeat(400)));
    expect(out).toContain(`> ${"😀".repeat(300)}…\n`);
  });

  it("is literal in Slack and says that there are more", () => {
    const out = withQuotedNote(`*Approve*\n<${LINK}|Open in Ziffr>`, "slack", note("<!channel> & <https://evil.test|Approve>", 2));
    expect(out).toBe(`*Approve*\nNote from Ben Ortiz:\n> &lt;!channel&gt; &amp; &lt;https: //evil.test|Approve&gt;\n2 more notes are on the task's page.\n<${LINK}|Open in Ziffr>`);
  });
});
