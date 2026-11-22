"use client";
// The Slack connection on the Connectors page (spec 0007; GLOSSARY: Connector). Owners and Admins connect or
// disconnect the workspace's Slack; everyone sees how Slack knows them, and can link their Slack account with a code.
// It gets the Slack workspace's name only, never its token.
import { shown, unwrap } from "@/lib/action-error";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import { AnsweredForm } from "@/components/answered-form";
import { connectSlack, disconnectSlack, slackLinkCode, slackRemindersAgain, unlinkSlack } from "@/app/connector-actions";
import type { SlackConnectionView } from "@ziffr/core/slack-connection";

/** Connect, disconnect and link Slack. `link` is how the viewer is known there; `stopped`, whether they stopped
 * Prompts and reminders on Slack; `notice`, what "Add to Slack" did. */
export function SlackPanel({ connection, link, stopped, notice }: { connection: SlackConnectionView; link: "code" | "email" | null; stopped: boolean; notice?: string }) {
  const [pending, start] = useTransition();
  const { confirm, dialog } = useConfirm();
  const [code, setCode] = useState<{ code: string; minutes: number } | null>(null);
  const run = (f: () => Promise<unknown>, ok?: string) => start(async () => { try { unwrap(await f()); if (ok) toast.success(ok); } catch (err) { toast.error("Not done", { description: shown(err) }); } });
  const team = connection.team;
  return (
    <section aria-labelledby="slack-h" className="stock mb-12 rounded-[var(--radius-card)] p-4 text-sm">
      {dialog}
      <h2 id="slack-h" className="flex items-center gap-2 text-[length:var(--text-lg)]"><MessageSquare aria-hidden className="size-4" /> Slack</h2>
      {notice && <p role="status" className="mt-2 font-medium">{notice}</p>}
      {stopped && (
        <p role="status" className="mt-2 flex flex-wrap items-center gap-3">
          You stopped requests for numbers and reminders on Slack in this workspace.
          <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => slackRemindersAgain(), "You get them on Slack again")}>Get them on Slack again</Button>
        </p>
      )}
      {team ? (
        <p className="mt-2 text-muted-foreground">Connected to <span className="font-medium text-foreground">{team.name || "your Slack workspace"}</span>. Messages by Slack arrive as direct messages from the Ziffr app{team.customizes ? ", under this Workspace's name and logo" : ""}; answers in their thread come back.</p>
      ) : (
        <p className="mt-2 text-muted-foreground">Not connected: messages by Slack are only recorded in the Outbox.{connection.canManage ? "" : " An Owner or Admin can connect it."}</p>
      )}
      {team && !team.customizes && (
        <p role="status" className="mt-2">
          Messages arrive under the Ziffr app&apos;s name and icon, not this Workspace&apos;s name and logo, because this connection was made without Slack&apos;s permission to change them.{connection.canManage ? " Choose Reconnect Slack to grant it. If it still does not, whoever runs this Ziffr adds the chat:write.customize scope to the Slack app first (see the Slack guide)." : " An Owner or Admin can reconnect Slack to change that."}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {connection.canManage && !team && <AnsweredForm action={connectSlack}><Button type="submit" disabled={pending}>Add to Slack</Button></AnsweredForm>}
        {connection.canManage && team && !team.customizes && <AnsweredForm action={connectSlack}><Button type="submit" variant="outline" disabled={pending}>Reconnect Slack</Button></AnsweredForm>}
        {connection.canManage && team && <Button variant="outline" disabled={pending} onClick={async () => { if (await confirm({ title: "Disconnect Slack?", description: "Nobody gets messages there any more until it is connected again. Who was found on Slack is forgotten.", confirmLabel: "Disconnect Slack" })) run(() => disconnectSlack(), "Slack is disconnected"); }}>Disconnect Slack</Button>}
      </div>
      {team && (
        <div className="mt-4 border-t border-border pt-3">
          <p>{link === "code" ? "Your Slack account is linked." : link === "email" ? "Slack found you by your email address." : "Slack finds you by your email address. If your Slack address is another one, link your account."}</p>
          {code ? (
            <p className="mt-2">Send the Ziffr app on Slack this message within {code.minutes} minutes: <code className="rounded bg-[var(--muted)] px-1.5 py-0.5 select-all">link {code.code}</code></p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(async () => setCode(unwrap(await slackLinkCode())))}>Link my Slack account</Button>
              {link && <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => unlinkSlack(), "Slack forgot you here")}>Forget me on Slack</Button>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
