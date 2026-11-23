// Who vouches for a Pack's name and logo (GLOSSARY: Pack, Marketplace; spec 0039): the lines the Packs page, the install
// preview and the update page say beside the author, in plain words and with no badge, so a faker has nothing to copy.
// Pure: it decides only what to say.

/** What the page may say about a Pack's author and logo, from where the file came: the Marketplace signed it, or it is an
 * uploaded file that says only what it says about itself. `id` is the Pack's id as the file writes it. */
export function packVoucher(p: { id: string; signed: boolean; fromMarketplace: boolean; hasLogo: boolean }): { vouched: boolean; lines: string[] } {
  const what = p.hasLogo ? "name and logo" : "name";
  const handle = p.id.split("/")[0];
  if (p.signed && p.fromMarketplace) {
    // The Marketplace signs a file only for the account that owns the handle, so the handle is real. That is all the
    // signature proves: no line claims the name or logo was reviewed until the Marketplace signs such a field.
    return { vouched: true, lines: [`Published through the Marketplace as @${handle}.`] };
  }
  const lines = [`Uploaded file. The Marketplace did not check it. Its ${what} ${p.hasLogo ? "are" : "is"} what the file says about itself.`, `Its id is ${p.id}, as the file writes it; only the Marketplace can prove a handle.`];
  if (handle === "ziffr") lines.push("This file says it is from Ziffr. It is not signed by the Marketplace.");
  return { vouched: false, lines };
}
