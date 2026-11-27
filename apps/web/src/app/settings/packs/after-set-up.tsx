"use client";
// The ways after a Pack's set-up on its card (spec 0068, #1345; GLOSSARY: Pack): finish it, choose who provides the
// numbers, set the asked numbers for a new period, change who approves, invite the people of the set-up. Only what the
// core offers this Owner or Admin is shown; each leads to a screen of its own, which checks again.
import { PHONE_LINK_BUTTON } from "@/app/setup/phone";
import { afterHref } from "@/app/use-pack/switch";
import type { PackCard } from "@ziffr/core/pack-after-card";

/** The links of one installed Pack. */
export function AfterSetUp({ card, name }: { card: PackCard; name: string }) {
  const links: [string, string][] = [
    ...(card.finish === "you" ? [[`/use-pack/${card.installId}`, "Finish setting up"] as [string, string]] : []),
    ...(card.providers ? [[afterHref(card.installId, "providers"), "Choose who provides them"] as [string, string]] : []),
    ...(card.numbers ? [[afterHref(card.installId, "targets"), card.numbers] as [string, string]] : []),
    ...(card.approver ? [[afterHref(card.installId, "approver"), "Change who approves"] as [string, string]] : []),
    ...(card.invite ? [[afterHref(card.installId, "invite"), "Invite the people from this set-up"] as [string, string]] : []),
  ];
  return (
    <div className="mt-3 space-y-2">
      {card.finish === "someone" && <p className="text-muted-foreground">Someone else started setting this Pack up here. They can finish it.</p>}
      {card.providers > 0 && <p className="text-muted-foreground">Nobody provides {card.providers === 1 ? "one of its numbers" : `${card.providers} of its numbers`} yet.</p>}
      {links.length > 0 && (
        // Plain links: the screens are drawn without the app around them, so each is loaded anew.
        <ul aria-label={`After setting up ${name}`} className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {links.map(([href, words]) => <li key={href}><a href={href} className={PHONE_LINK_BUTTON}>{words}</a></li>)}
        </ul>
      )}
    </div>
  );
}
