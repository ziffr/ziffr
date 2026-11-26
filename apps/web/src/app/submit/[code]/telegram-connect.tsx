"use client";
// Telegram on a personal form page (spec 0016, ticket #25): the person whose form it is, often a Contact without a
// login, connects their own Telegram with a one-time link. The form code is the credential, so it cannot disconnect
// (that would let anyone holding a forwarded link move the messages to their own account): /stop in Telegram does.
import { shown, unwrap } from "@/lib/action-error";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { telegramFormLinkStart } from "@/app/connector-actions";

/** Connect Telegram for the person whose form `code` is. */
export function TelegramConnect({ code, linked }: { code: string; linked: boolean }) {
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
      ) : link ? (
        <p className="flex flex-wrap items-center gap-2">
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center max-sm:h-11 rounded-[var(--radius-input)] border border-input px-3 font-medium hover:bg-muted">Open Telegram</a>
          <span className="text-muted-foreground">and tap Start within {link.minutes} minutes.</span>
        </p>
      ) : (
        <p className="flex flex-wrap items-center justify-between gap-2">
          <span>Get these requests in Telegram, and answer them there.</span>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(async () => setLink(unwrap(await telegramFormLinkStart(code))))}>Connect Telegram</Button>
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-destructive">{error}</p>}
    </div>
  );
}
