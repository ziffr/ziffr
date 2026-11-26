// A Pack's logo and who vouches for it (spec 0039, GLOSSARY: Pack): the one place a Pack's picture is drawn. Always an
// `img` (it runs no script, whatever the picture is) in a fixed, bordered box, never inline markup and never part of
// Ziffr's own chrome; the source is the install's own address, or the checked data address of a file not yet installed.
import { packVoucher } from "@ziffr/core/pack-voucher";

/** The logo in its box, 48 pixels high and 160 wide at most, with the words for people who cannot see it. */
function PackLogo({ src, author, label }: { src: string | null; author: string; label?: string }) {
  if (!src) return null;
  return (
    <span className="inline-flex h-12 w-40 max-w-full shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-input)] border border-input bg-white p-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={label ?? `Logo of ${author}`} className="max-h-full max-w-full object-contain" referrerPolicy="no-referrer" decoding="async" />
    </span>
  );
}

/** "by <author>", with the logo, and under it who vouches for both: the Marketplace, or nobody. */
export function Publisher({ author, logo, id, signed, fromMarketplace, included = false, reviewed = false }: { author: string; logo: string | null; id: string; signed: boolean; fromMarketplace: boolean; included?: boolean; reviewed?: boolean }) {
  const v = packVoucher({ id, signed, fromMarketplace, hasLogo: logo !== null, included, reviewed });
  return (
    <div className="flex flex-wrap items-center gap-3">
      <PackLogo src={logo} author={author} />
      <div className="min-w-0 text-xs text-muted-foreground">
        <p className="text-sm text-foreground">by {author}</p>
        {v.lines.map((l, i) => <p key={i}>{l}</p>)}
      </div>
    </div>
  );
}

/** A new version with another logo: the old and the new side by side, to read before the update is taken. */
export function LogoChange({ logo, author }: { logo: { before: string | null; after: string | null; changed: boolean }; author: string }) {
  if (!logo.changed) return null;
  return (
    <div className="rounded-[var(--radius-input)] border border-input p-2.5 text-sm">
      <p className="font-medium">The logo changed</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>Now</span>{logo.before ? <PackLogo src={logo.before} author={author} label={`Current logo of ${author}`} /> : <span>none</span>}
        <span>New version</span>{logo.after ? <PackLogo src={logo.after} author={author} label={`New logo of ${author}`} /> : <span>none</span>}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Themes you did not change take the new logo. A Theme you changed keeps its own logo, a logo you set yourself is never replaced, and where you removed the Pack&rsquo;s logo it stays removed.</p>
    </div>
  );
}
