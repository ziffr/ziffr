// What stands where the slide editor cannot draw (GLOSSARY: Deck, Free Layout, Installation Settings): plain words,
// and for an Installation Admin the way to the setting.
import Link from "next/link";

/** `admin` set (either way) adds who can change it. It stays clickable where the canvas around it takes no pointer, and
 * above a presentation's click areas. */
export function SlideNotice({ heading, words, admin, settings, missing }: { heading: string; words: string; admin?: boolean; settings?: string; missing?: boolean }) {
  return (
    <div role="status" className="pointer-events-auto relative z-10 flex h-full w-full overflow-auto bg-card p-3 text-center text-sm text-card-foreground">
      <div className="m-auto max-w-[48ch] space-y-1">
        <p className="font-medium">{heading}</p>
        <p>{words}</p>
        {admin === true && <p><Link href={settings ?? "/installation#slides"} className="inline-flex min-h-11 items-center underline underline-offset-2">{missing ? "Add the license key" : "Check the license key"}</Link></p>}
        {admin === false && <p className="text-muted-foreground">The person who runs this Ziffr can {missing ? "add one" : "change it"}.</p>}
      </div>
    </div>
  );
}
