"use client";
// Telegram on a personal form page (spec 0016, ticket #25): the Contact whose form it is connects their own Telegram
// with a one-time link, and confirms it from an email Ziffr sends to the address it keeps for them. Where no such email
// can go, the page says why and who can help instead of offering it. A form cannot disconnect: /stop in Telegram does.
import { shown, unwrap } from "@/lib/action-error";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { telegramFormLinkStart } from "@/app/connector-actions";

/** Connect Telegram for the person whose form `code` is; `help` says why this form cannot start a connection. */
export function TelegramConnect({ code, linked, help }: { code: string; linked: boolean; help: string | null }) {
  const [pending, start] = useTransition();
  const [link, setLink] = useState<{ url: string; minutes: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = (f: () => Promise<void>) => start(async () => { try { setError(null); await f(); } catch (err) { setError(shown(err)); } });
  return (
    <div className="mt-4 rounded-2xl border bg-background p-4 text-sm">
      {linked ? (
        <p className="flex flex-wrap items-center justify-between gap-2">
          <span>Requests for numbers reach you in Telegram. To stop them, send /stop to the bot there.</span>
        </p>
      ) : help ? (
        <p>{help}</p>
      ) : link ? (
        <p className="flex flex-wrap items-center gap-2">
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center max-sm:h-11 rounded-[var(--radius-input)] border border-input px-3 font-medium hover:bg-muted">Open Telegram</a>
          <span className="text-muted-foreground">and tap Start within {link.minutes} minutes. Then confirm in the email Ziffr sends you, with the number the bot shows.</span>
        </p>
      ) : (
        <p className="flex flex-wrap items-center justify-between gap-2">
          <span>Get these requests in Telegram, and answer them there. You confirm it by email.</span>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(async () => setLink(unwrap(await telegramFormLinkStart(code))))}>Connect Telegram</Button>
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
    </div>
  );
}
