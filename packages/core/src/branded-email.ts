// The email layout (GLOSSARY: Theme, Delivery; ticket #542): one layout for every email Ziffr sends for a Workspace,
// drawn from its default Theme: logo (or the Workspace's name), accent, footer. Table layout with inline styles, a
// web-safe font stack, colours that stay readable when the reader's mail app is dark (a media query for the clients
// that honour it, and the light colours already checked for contrast for the ones that do not). Everything a person
// wrote is escaped, and a link is made only from an https: or http: address. The plain-text part is the caller's own
// text and is always sent too. Pure.
import { contrastRatio, readableOn, type ThemeLook } from "./theme-look";
import { FONTS } from "./themes";

/** The content id the logo is attached under; the layout refers to it as cid:ziffr-logo. */
export const LOGO_CID = "ziffr-logo";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

// Colours for the reader's dark mode: neutral, and the accent made readable on them.
const NIGHT = { canvas: "#101216", surface: "#1A1D23", ink: "#ECEEF2", muted: "#A9AFBA", rule: "#2F343E" };

/** The type of a logo that an email client can show: a PNG or JPEG of at most `max` bytes. SVG and WebP are not drawn by
 * most email clients, so they give null and the email shows the name instead. */
export function emailLogoType(look: Pick<ThemeLook, "logo">, max = 150_000): "image/png" | "image/jpeg" | null {
  const m = /^data:(image\/(?:png|jpeg));base64,([a-z0-9+/=]+)$/i.exec(look.logo ?? "");
  return m && m[2].length * 0.75 <= max ? (m[1].toLowerCase() as "image/png" | "image/jpeg") : null;
}

/** The logo as bytes and a type for an attachment, or null (see emailLogoType). */
export function emailLogo(look: Pick<ThemeLook, "logo">, max = 150_000): { content: Buffer; contentType: string } | null {
  const contentType = emailLogoType(look, max);
  if (!contentType) return null;
  const content = Buffer.from(look.logo!.slice(look.logo!.indexOf(",") + 1), "base64");
  return content.length > 0 && content.length <= max ? { content, contentType } : null;
}

/** What an email says, besides the brand: its paragraphs (the plain text, blank lines between them), a line under it
 * for the one-click stop link, and a short line shown before it opens (the preheader). */
export type EmailContent = { text: string; stop?: { label: string; url: string }; preheader?: string;
  /** Who is really behind the message, in Ziffr's own words; a fixed line in the footer that no Theme can change or remove. */
  sentBy?: string };

// Text becomes paragraphs; an address that starts with https:// or http:// becomes a link; a "> " line is a quote.
function paragraphs(text: string, accent: string, rule: string): string {
  const link = (line: string) => line.split(/(https?:\/\/[^\s<>"']+)/g).map((part, i) => {
    if (i % 2 === 0) return esc(part);
    const url = part.replace(/[.,;:!?)]+$/, "");
    const rest = part.slice(url.length);
    return `<a href="${esc(url)}" class="accent" style="color:${accent};text-decoration:underline;">${esc(url)}</a>${esc(rest)}`;
  }).join("");
  return text.replace(/\r\n?/g, "\n").trim().split(/\n{2,}/).map((block) => {
    const lines = block.split("\n");
    const quoted = lines.every((l) => l.startsWith(">"));
    const inner = lines.map((l) => link(quoted ? l.replace(/^>\s?/, "") : l)).join("<br>");
    return quoted
      ? `<blockquote class="rule" style="margin:0 0 16px;padding:0 0 0 12px;border-left:3px solid ${rule};">${inner}</blockquote>`
      : `<p style="margin:0 0 16px;">${inner}</p>`;
  }).join("");
}

/** The email as HTML for this look. `scheme` forces the light or the dark colours (the preview on the Themes page); a
 * real email leaves it out and the reader's app chooses. The logo is shown as cid:ziffr-logo only when `logo` says
 * it is attached (emailLogo); otherwise the Workspace's name stands in its place. */
export function emailHtml(look: ThemeLook, content: EmailContent, opts: { logo?: boolean; scheme?: "light" | "dark" } = {}): string {
  const lightBase = { canvas: look.canvas, surface: look.surface, ink: look.ink, muted: look.muted, rule: look.rule, accent: look.accent };
  const nightAccent = readableOn(look.accent, NIGHT.surface);
  const night = { ...NIGHT, accent: nightAccent };
  // A Theme that is itself dark keeps its own colours: no override for a reader's dark mode, it already is.
  const themeIsDark = contrastRatio(look.surface, "#FFFFFF") > contrastRatio(look.surface, "#000000");
  const base = opts.scheme === "dark" ? night : lightBase;
  const heading = FONTS[look.fontHeading]?.stack ?? FONTS.arial.stack;
  const body = FONTS[look.fontBody]?.stack ?? FONTS.arial.stack;
  // Quoted font names inside a style attribute use single quotes.
  const stack = (s: string) => s.replace(/"/g, "'");
  const width = Math.min(look.logoWidth, 200);
  const height = Math.max(16, Math.min(56, Math.round(width / look.logoRatio)));
  const header = opts.logo
    ? `<img src="cid:${LOGO_CID}" alt="${esc(look.name)}" height="${height}" style="display:block;height:${height}px;width:auto;max-width:200px;border:0;">`
    : `<span class="ink" style="font:600 20px/1.2 ${stack(heading)};color:${base.ink};">${esc(look.name)}</span>`;
  // Ziffr's own identity stays in every email: whatever the Theme's footer says, this line says who sent it and through what.
  const footer = [look.footer, content.sentBy ?? `Sent by Ziffr for ${look.name}`].filter(Boolean);
  const css = `
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    ${themeIsDark || opts.scheme ? "" : `@media (prefers-color-scheme: dark) {
      .bg { background-color: ${night.canvas} !important; }
      .card { background-color: ${night.surface} !important; }
      .ink { color: ${night.ink} !important; }
      .muted { color: ${night.muted} !important; }
      .accent { color: ${night.accent} !important; }
      .bar { background-color: ${night.accent} !important; }
      .rule { border-color: ${night.rule} !important; }
    }`}`;
  const stop = content.stop ? `<p class="muted" style="margin:16px 0 0;font-size:13px;line-height:1.5;color:${base.muted};">${esc(content.stop.label)}: <a href="${esc(content.stop.url)}" class="accent" style="color:${base.accent};text-decoration:underline;">${esc(content.stop.url)}</a></p>` : "";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(look.name)}</title><style>${css}</style></head>
<body class="bg" style="margin:0;padding:0;background-color:${base.canvas};">
${content.preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(content.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="bg" style="background-color:${base.canvas};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="card" style="max-width:560px;background-color:${base.surface};border-radius:8px;overflow:hidden;">
<tr><td class="bar" height="4" style="height:4px;line-height:4px;font-size:4px;background-color:${base.accent};">&nbsp;</td></tr>
<tr><td style="padding:24px 28px 8px;">${header}</td></tr>
<tr><td class="ink" style="padding:8px 28px 24px;font:16px/1.55 ${stack(body)};color:${base.ink};">${paragraphs(content.text, base.accent, base.rule)}${stop}</td></tr>
<tr><td class="rule muted" style="padding:16px 28px;border-top:1px solid ${base.rule};font:12px/1.5 ${stack(body)};color:${base.muted};">${footer.map(esc).join("<br>")}</td></tr>
</table></td></tr></table></body></html>`;
  return html;
}
