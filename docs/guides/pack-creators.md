# For Pack creators

This is the short version for people who make Packs to share or publish. [Writing a Pack](packs.md) has the full format.

## Make the file

The easiest way is **Workspace → Packs → Export as Pack…**: pick what goes in, name the Pack, choose an **Author** (it starts as your name; use your company's if the Pack is theirs) and download it. The file holds descriptions and layouts, never a value or a person.

## Explain it

A Pack may carry a **Pack Guide**: what it is for, what to have ready, the first steps, each part and common questions, as headings, paragraphs, lists and bold words, written in the file's `guide` (format `ziffr.pack/2`). No links, images, HTML or code. Ziffr checks it already and will show it before installing and in Help; [the format](packs.md#the-pack-guide) says how to write one.

## Your logo

A Pack may bring **one logo**, shown with the author's name on the Packs page and the Marketplace.

- **Formats:** PNG, JPEG or plain SVG, as a base64 data address in the manifest's `logo`.
- **Size:** at most 128,000 bytes and 512 pixels on each side. A mark does not need more, and the Marketplace lists many Packs at once.
- **Plain SVG:** no script, event handlers, links, styles, entities, foreign content or `<!DOCTYPE>`. Ziffr reads the SVG strictly and writes it out again; that written-out form is what is kept and shown.
- **Export as Pack** lets you take the logo of one of your Themes or upload a picture. Themes that use that logo carry `"logo": "pack"`; a Theme with another logo keeps it out of the file, since a Pack has one logo.
- **It stays yours.** A Pack's license covers its contents, not your trademark. Put in only a logo you may share; someone else's logo in a Pack is a reason to take it down from the Marketplace.
- A Pack with a logo needs a Ziffr that knows the field: `ziffr` in the manifest says which, and Export as Pack sets it.

## Check it before you share it

```sh skip="installs a package and needs a Pack file of your own"
npx @ziffr/pack check my.pack.json
```

This runs the very same checks Ziffr runs when someone installs the Pack, logo included, and names the line of anything it refuses. Add `--ziffr 0.12.0` to also check that the Pack installs on that Ziffr.

## Then

Share the file, or publish it on the Marketplace when that is open to you. Whoever installs an uploaded file is told that nobody vouches for it; a signed one says the Marketplace does.
