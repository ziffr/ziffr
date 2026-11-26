"use client";
// The email layout of a Theme, as it will arrive (GLOSSARY: Theme; ticket #542): light and dark, drawn by the same
// function the server sends with. Shown in a sandboxed frame with no scripts, so what it draws cannot touch this page.
import { useMemo } from "react";
import { emailHtml, emailLogoType, LOGO_CID } from "@ziffr/core/branded-email";
import { themeLook } from "@ziffr/core/theme-look";
import type { Theme } from "@ziffr/core/types";

const SITE = "https://app.example.com";
const SAMPLE = `Hi Sara,\n\nPlease report Monthly recurring revenue for November 2026.\n\nEnter it in your form: ${SITE}/submit/your-personal-form-link`;

/** Two frames: the email in light colours and in dark colours, from the Theme as it is being edited. */
export function EmailPreview({ theme, workspaceName }: { theme: Pick<Theme, "tokens" | "slides">; workspaceName: string }) {
  const frames = useMemo(() => {
    const look = themeLook(theme, workspaceName);
    const content = { text: SAMPLE, own: [SITE], stop: { label: "To get no more of these by email", link: "Unsubscribe from these emails", url: `${SITE}/api/unsubscribe/example` } };
    // In an email the logo is attached; here the frame has it inline (the same picture, only when an email client could show it).
    const inline = (html: string) => (emailLogoType(look) && look.logo ? html.replace(`cid:${LOGO_CID}`, look.logo) : html);
    const logo = Boolean(emailLogoType(look));
    return (["light", "dark"] as const).map((scheme) => ({ scheme, html: inline(emailHtml(look, content, { logo, scheme })) }));
  }, [theme, workspaceName]);
  return (
    <section aria-labelledby="email-preview" className="space-y-2">
      <h2 id="email-preview" className="text-sm font-medium">Email</h2>
      <p className="text-xs text-muted-foreground">Prompts, reminders, Alerts, invitations and the usage digest are sent in this layout, with the plain text beside it. The logo shows when it is a PNG or JPEG; otherwise the workspace name does.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {frames.map((f) => (
          <iframe key={f.scheme} title={`Email, ${f.scheme} colours`} sandbox="" srcDoc={f.html} className="h-96 w-full rounded-[var(--radius-card)] border border-border bg-white" />
        ))}
      </div>
    </section>
  );
}
