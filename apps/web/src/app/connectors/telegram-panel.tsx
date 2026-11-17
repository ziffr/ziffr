"use client";
// Telegram on the Connectors page (spec 0016, tickets #24 and #25; GLOSSARY: Connector). Owners and Admins turn it on
// or off for the workspace; everyone sees which bot it is and that Telegram can read what goes through it, and
// connects their own Telegram with a one-time link. It gets the bot's username only, never its token.
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { setTelegram, telegramLinkStart, telegramRemindersAgain, telegramUnlink } from "@/app/connector-actions";
import type { TelegramConnectionView } from "@ziffr/core/telegram-connection";

/** Turn Telegram on or off, and connect or disconnect your own Telegram. `linked`: whether the viewer is connected;
 * `stopped`: whether they stopped Prompts and reminders on Telegram with the button under one. */
export function TelegramPanel({ connection, linked, stopped }: { connection: TelegramConnectionView; linked: boolean; stopped: boolean }) {
  const [link, setLink] = useState<{ url: string; minutes: number } | null>(null);
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const run = (f: () => Promise<unknown>, ok?: string) => start(async () => { try { await f(); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: (err as Error).message }); } });
  const { bot, enabled, canManage } = connection;
  return (
    <section aria-labelledby="telegram-h" className="stock mb-12 rounded-[var(--radius-card)] p-4 text-sm">
      {dialog}
      <h2 id="telegram-h" className="flex items-center gap-2 text-[length:var(--text-lg)]"><Send aria-hidden className="size-4" /> Telegram</h2>
      {stopped && (
        <p role="status" className="mt-2 flex flex-wrap items-center gap-3">
          You stopped requests for numbers and reminders on Telegram in this workspace.
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => telegramRemindersAgain(), "You get them on Telegram again")}>Get them on Telegram again</Button>
        </p>
      )}
      {!bot ? (
        <p className="mt-2 text-muted-foreground">Telegram does not accept this Ziffr&rsquo;s bot token. Whoever runs Ziffr should check <code>ZIFFR_TELEGRAM_BOT_TOKEN</code>.</p>
      ) : enabled ? (
        <p className="mt-2 text-muted-foreground">On in this workspace. Messages by Telegram come from <span className="font-medium text-foreground">@{bot.username}</span>; people connect their own Telegram to get them.</p>
      ) : (
        <p className="mt-2 text-muted-foreground">Off in this workspace: Ziffr sends nothing by Telegram here.{canManage ? "" : " An Owner or Admin can turn it on."}</p>
      )}
      <p className="mt-2 text-muted-foreground">Telegram can read what its bots send and receive: numbers and questions sent this way pass through Telegram&rsquo;s servers.</p>
      {connection.polling && <p className="mt-2 text-muted-foreground">Answers are fetched by polling (<code>ZIFFR_TELEGRAM_POLLING</code>), as on a laptop: <code>pnpm telegram:poll</code> must be running.</p>}
      {canManage && bot && (
        <div className="mt-3 flex flex-wrap gap-2">
          {enabled ? (
            <Button variant="outline" disabled={pending} onClick={async () => { if (await confirm({ title: "Turn Telegram off?", description: "Nobody in this workspace gets messages there until it is turned on again. Who connected their Telegram stays connected.", confirmLabel: "Turn off" })) run(() => setTelegram(false), "Telegram is off"); }}>Turn off</Button>
          ) : (
            <Button disabled={pending} onClick={() => run(() => setTelegram(true), "Telegram is on")}>Turn on</Button>
          )}
        </div>
      )}
      {bot && enabled && (
        <div className="mt-4 border-t border-border pt-3">
          {linked ? (
            <p className="flex flex-wrap items-center gap-3">
              Your Telegram is connected: Ziffr messages for this workspace reach you there.
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => telegramUnlink(), "Telegram is disconnected")}>Disconnect</Button>
            </p>
          ) : link ? (
            <p className="flex flex-wrap items-center gap-3">
              {/* A link the person opens themselves: a window opened after the round trip would be blocked. */}
              <a href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center rounded-[var(--radius-input)] border border-input px-3 text-sm font-medium hover:bg-muted">Open Telegram</a>
              <span className="text-muted-foreground">and tap Start within {link.minutes} minutes. Then reload this page.</span>
            </p>
          ) : (
            <p className="flex flex-wrap items-center gap-3">
              Get Ziffr messages for this workspace in Telegram.
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(async () => setLink(await telegramLinkStart()))}>Connect Telegram</Button>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
