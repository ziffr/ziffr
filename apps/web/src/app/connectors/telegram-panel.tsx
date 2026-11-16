"use client";
// Telegram on the Connectors page (spec 0016, ticket #24; GLOSSARY: Connector). Owners and Admins turn it on or off
// for the workspace; everyone sees which bot it is and that Telegram can read what goes through it. It gets the
// bot's username only, never its token.
import { useTransition } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { setTelegram } from "@/app/connector-actions";
import type { TelegramConnectionView } from "@ziffr/core/telegram-connection";

/** Turn Telegram on or off, and say what that means. */
export function TelegramPanel({ connection }: { connection: TelegramConnectionView }) {
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const run = (f: () => Promise<unknown>, ok: string) => start(async () => { try { await f(); toast.success(ok); } catch (err) { toast.error("Not done", { description: (err as Error).message }); } });
  const { bot, enabled, canManage } = connection;
  return (
    <section aria-labelledby="telegram-h" className="stock mb-12 rounded-[var(--radius-card)] p-4 text-sm">
      {dialog}
      <h2 id="telegram-h" className="flex items-center gap-2 text-[length:var(--text-lg)]"><Send aria-hidden className="size-4" /> Telegram</h2>
      {!bot ? (
        <p className="mt-2 text-muted-foreground">Telegram does not accept this Ziffr&rsquo;s bot token. Whoever runs Ziffr should check <code>ZIFFR_TELEGRAM_BOT_TOKEN</code>.</p>
      ) : enabled ? (
        <p className="mt-2 text-muted-foreground">On in this workspace. Messages by Telegram come from <span className="font-medium text-foreground">@{bot.username}</span>; people connect their own Telegram to get them.</p>
      ) : (
        <p className="mt-2 text-muted-foreground">Off in this workspace: Ziffr sends nothing by Telegram here.{canManage ? "" : " An Owner or Admin can turn it on."}</p>
      )}
      <p className="mt-2 text-muted-foreground">Telegram can read what its bots send and receive: numbers and questions sent this way pass through Telegram&rsquo;s servers.</p>
      {connection.polling && <p className="mt-2 text-muted-foreground">Answers are fetched by polling (<code>ZIFFR_TELEGRAM_POLLING</code>), as on a laptop, not sent here by Telegram.</p>}
      {canManage && bot && (
        <div className="mt-3 flex flex-wrap gap-2">
          {enabled ? (
            <Button variant="outline" disabled={pending} onClick={async () => { if (await confirm({ title: "Turn Telegram off?", description: "Nobody in this workspace gets messages there until it is turned on again. Who connected their Telegram stays connected.", confirmLabel: "Turn off" })) run(() => setTelegram(false), "Telegram is off"); }}>Turn off</Button>
          ) : (
            <Button disabled={pending} onClick={() => run(() => setTelegram(true), "Telegram is on")}>Turn on</Button>
          )}
        </div>
      )}
    </section>
  );
}
