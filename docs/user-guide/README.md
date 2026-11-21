# The user guide

The chapters in this folder are Ziffr's user guide, written for the people who use Ziffr, not for programmers. The app shows them at `/guide`, and every page links to it from the sidebar ("User guide"). The guide can be read without signing in.

## Editing the guide

Editing the guide needs no change to the app. Each chapter is a plain Markdown file, and the app reads the files each time someone opens the guide.

- **One file per chapter**, named with a number and an address: `02-concepts.md` is chapter 2 and opens at `/guide/concepts`. The numbers set the order; leave gaps (`25-…`) if you like.
- **The first `# Heading` is the chapter's title** in the guide's list of chapters.
- **To add a chapter**, add a file with a new number. **To remove one**, delete its file. Files without a number, such as this one, are not shown.
- **Link to another chapter by its file name**, `[Connecting](04-connecting.md)` or `[Feeds](04-connecting.md#feeds-numbers-from-other-systems)`. The link works both here and in the app.
- **Plain Markdown only**: headings, paragraphs, lists, tables, bold and italic, links, quotes and code blocks. HTML is shown as text, comments are not shown, and pictures are not shown yet.
- **Use the words of [GLOSSARY.md](../../GLOSSARY.md)**, with their capital letters, and never its _Avoid_ words. Write for someone who has never used a business intelligence tool.

## Parts, and the screens a chapter describes

A chapter may start with two lines that readers never see:

```md
<!-- part: Screen by screen -->
<!-- screens: apps/web/src/app/metrics/**, apps/web/src/components/target-chip.tsx -->
```

- **`part`** groups the list of chapters in the app: a chapter whose part differs from the one before it shows the part's name above it.
- **`screens`** names the app's files that make up the screens the chapter describes. `*` stands for any name within one folder, `**` for anything in a folder and below it.

The `screens` line keeps the guide up to date, with two checks:

1. **Every page is described.** `pnpm test` fails when a page of the app is named by no chapter (pages that are no screen of their own are listed, with the reason, in `scripts/guide-screens.mjs`), or when a chapter names a path that no longer exists.
2. **A changed screen changes its chapter.** In CI, and in `pnpm ci:local`, a pull request that changes a file a chapter names must change that chapter too. When a change alters nothing people see, such as a refactoring, a maintainer adds the label `no-guide-change` instead.

When you add a screen, name its files in the chapter that describes it, or start a new chapter for it.

## The glossary chapter

`90-words-in-ziffr.md` holds a title, a short introduction and the line `<!-- glossary -->`. When the page is opened, the app puts the whole of [GLOSSARY.md](../../GLOSSARY.md) in place of that line, so the guide always explains the words exactly as the glossary defines them. To change a definition, change `GLOSSARY.md`. Its _Avoid_ words are shown as "Elsewhere you may see", leaving out any that are Ziffr terms themselves.

- **Bold terms become links.** In every other chapter, the first bold mention of a glossary term, such as `**Stand-in**` or `**Stand-ins**`, leads to its entry. Write the term in bold where you introduce it, and the link follows.
- **The chapter can move or go.** Renumber the file to move it; delete it and the guide has no glossary and no term links.

On a Ziffr you run yourself, a change shows as soon as the file on the server changes. A change merged into the repository reaches a hosted installation with its next deploy, without a new release of the app.

## Keeping the guide somewhere else

A team that keeps its guide in its own wiki or website sets `ZIFFR_USER_GUIDE_URL` to that page's address; the app's "User guide" link then leads there. `ZIFFR_USER_GUIDE_DIR` points the app at a different folder of chapters, for example a translated copy.
