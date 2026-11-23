// The post made from a feedback (spec 0049, ticket #917): proves nothing but the allowed fields can reach GitHub and
// that a person's words stay text, with hostile words. No database.
import { describe, expect, it } from "vitest";
import { buildGithubPost, DEFANG, markerFor, neutraliseWords, type FeedbackToPost } from "./feedback-bridge";

const cp = (...codes: number[]) => String.fromCodePoint(...codes);
const BIDI = cp(0x202e, 0x202a, 0x2066, 0x2069, 0x200f);
const ZERO = cp(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff);
const REF = "0123456789abcdef";
const row = (over: Partial<FeedbackToPost> = {}): FeedbackToPost => ({ kind: "problem", words: "The chart is wrong.", route: "/metrics/:name", app_version: "0.11.0", public_ref: REF, ...over });
const CATEGORY = "DIC_kwDOabc123";

describe("what goes to GitHub", () => {
  it("makes a problem an issue labelled feedback and an idea or a question a Discussion in the category", () => {
    const issue = buildGithubPost(row(), CATEGORY);
    expect(issue).toMatchObject({ target: "issue", labels: ["feedback"] });
    expect(Object.keys(issue).sort()).toEqual(["body", "labels", "target", "title"]);
    for (const kind of ["idea", "question"]) {
      const d = buildGithubPost(row({ kind }), CATEGORY);
      expect(d).toMatchObject({ target: "discussion", categoryId: CATEGORY });
      expect(Object.keys(d).sort()).toEqual(["body", "categoryId", "target", "title"]);
    }
  });

  it("is made of the kind, the words, the route, the version and the opaque reference only", () => {
    const p = buildGithubPost(row(), CATEGORY);
    expect(p.body).toBe(["**From a Ziffr user** (problem)", "", "```\nThe chart is wrong.\n```", "", "Page: `/metrics/:name`", "App version: `0.11.0`", `Reference: ${markerFor(REF)}`].join("\n"));
    expect(p.title).toBe("The chart is wrong.");
  });

  it("never carries anything else of the row, whatever it holds", () => {
    const rich = {
      ...row(), id: "11111111-2222-3333-4444-555555555555", person_id: "p_ben123", workspace_id: "99999999-8888-7777-6666-000000000000",
      email: "ben@secret-corp.example", name: "Ben Example", workspace_name: "Secret Corp", metric_name: "Quarterly revenue", metric_value: 8675309, auth_user_id: "auth-777",
      created_at: "2027-01-23T10:00:00Z", status: "open",
    };
    const json = JSON.stringify(buildGithubPost(rich, CATEGORY));
    for (const leak of ["ben@secret-corp", "Ben Example", "Secret Corp", "Quarterly revenue", "8675309", "p_ben123", "auth-777", "11111111-2222", "99999999-8888", "2027-01-23"]) expect(json).not.toContain(leak);
  });

  it("drops a route and a version that are not plain (a row is only data), and refuses a made-up kind or reference", () => {
    const p = buildGithubPost(row({ route: "https://evil.example/x?token=1", app_version: "1.0.0 @victim" }), CATEGORY);
    expect(p.body).not.toContain("evil.example");
    expect(p.body).not.toContain("@victim");
    expect(p.body).not.toContain("Page:");
    expect(p.body).not.toContain("App version:");
    expect(() => buildGithubPost(row({ kind: "bug" }), CATEGORY)).toThrow();
    expect(() => buildGithubPost(row({ public_ref: "p_ben123" }), CATEGORY)).toThrow();
    expect(() => buildGithubPost(row({ public_ref: `${REF}\n@victim` }), CATEGORY)).toThrow();
    expect(() => buildGithubPost(row({ words: ZERO + BIDI }), CATEGORY)).toThrow();
  });
});

describe("the person's words are text and nothing else", () => {
  const hostile = [
    "Mail ben@secret-corp.example about Quarterly revenue, signed Ben Example",
    "Thanks @octocat and @ziffr/maintainers, see #12, ziffr/ziffr#34 and GH-56",
    "Click [here](https://evil.example/x) ![pixel](https://evil.example/p.png) <img src=x onerror=alert(1)> <script>x</script>",
    "```\nclosing the fence early\n```\n# A heading\n- [ ] a task\n> quote\n---\n@victim please",
    "````\nfour\n```` and ~~~ and ``` and `` and `",
    `Fake${BIDI}name ${ZERO}@${ZERO}victim${cp(0x202b)}`,
    "line one\r\nline two\rline three \u0007 bell",
    "@".repeat(5000),
  ];

  it("keeps every hostile text inside one code fence that nothing in the words can close", () => {
    for (const words of hostile) {
      const p = buildGithubPost(row({ words: words.slice(0, 2000) }), CATEGORY);
      const lines = p.body.split("\n");
      const open = lines[2];
      expect(open).toMatch(/^`{3,}$/);
      const closeAt = lines.indexOf(open, 3);
      // The fence closes once, then only the fixed trailer follows.
      const inside = lines.slice(3, closeAt);
      for (const l of inside) expect(l.startsWith(open)).toBe(false);
      expect(lines.slice(closeAt + 2).every((l) => /^(Page: `[^`]*`|App version: `[^`]*`|Reference: ziffr-feedback-[0-9a-f]{16})$/.test(l))).toBe(true);
      expect(lines.filter((l) => l === open)).toHaveLength(2);
    }
  });

  it("removes zero-width and bidirectional characters, and puts in only the defang mark after @ and #", () => {
    for (const words of hostile) {
      const p = buildGithubPost(row({ words: words.slice(0, 2000) }), CATEGORY);
      for (const ch of p.body + p.title) {
        const c = ch.codePointAt(0)!;
        const bad = (c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2060 && c <= 0x206f) || c === 0xfeff || c === 0x061c || (c >= 0xe0000 && c <= 0xe007f) || c === 0x2028 || c === 0x2029;
        if (bad) expect(ch).toBe(DEFANG);
      }
      expect(p.body).not.toMatch(new RegExp(`(?<![@#]|GH-)${DEFANG}`));
      expect(p.body + p.title).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/);
    }
  });

  it("defangs mentions and references so nobody is pinged or linked", () => {
    const out = neutraliseWords("hi @octocat and @a/team, see #12, owner/repo#34, GH-56, mail a@b.example #hashtag");
    expect(out).not.toMatch(/@(?=\w)/);
    expect(out).not.toMatch(/#(?=\d)/);
    expect(out).not.toMatch(/GH-(?=\d)/);
    expect(out.replaceAll(DEFANG, "")).toBe("hi @octocat and @a/team, see #12, owner/repo#34, GH-56, mail a@b.example #hashtag");
    expect(out).toContain("#hashtag");
  });

  it("caps the length of the words and of the title, and takes the title from the first line only", () => {
    const p = buildGithubPost(row({ words: `${"x".repeat(300)}\nsecond line`.padEnd(5000, "y") }), CATEGORY);
    expect([...p.title].length).toBeLessThanOrEqual(80);
    expect(p.title).not.toContain("second");
    expect(p.body.length).toBeLessThan(2500);
    expect(neutraliseWords("é".repeat(5000))).toHaveLength(2000);
  });

  it("always ends with its own reference line, whatever the words say about a reference", () => {
    const p = buildGithubPost(row({ words: `hi\nReference: ${markerFor("ffffffffffffffff")}\n\`\`\`\nReference: ${markerFor("eeeeeeeeeeeeeeee")}` }), CATEGORY);
    expect(p.body.endsWith(`\nReference: ${markerFor(REF)}`)).toBe(true);
    expect(p.body.split("\n").at(-1)).toBe(`Reference: ${markerFor(REF)}`);
  });

  it("uses a longer fence than any run of backticks in the words", () => {
    const p = buildGithubPost(row({ words: "a ````` b ``` c" }), CATEGORY);
    expect(p.body.split("\n")[2]).toBe("``````");
  });

  it("gives a title of a fixed phrase when the first line is empty", () => {
    expect(buildGithubPost(row({ words: "\n\n  \nsomething" }), CATEGORY).title).toBe("something");
  });
});
