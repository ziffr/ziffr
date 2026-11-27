// The slide editor's license key for a browser that is about to draw a Deck or a free layout (GLOSSARY: Installation
// Settings, Deck, View Link). Open without sign-in: people with a View Link need it, and the key is no secret once a
// browser draws with it. It answers with that one setting and whether the person asking is an Installation Admin, so
// the notice can link to the setting; nothing else leaves the settings, which hold secrets.
import { NextResponse } from "next/server";
import { isInstallationAdmin } from "@ziffr/core/installation-admins";
import { settingsInEffect } from "@ziffr/core/settings-in-effect";
import { slideEditorLicenseKey } from "@ziffr/core/slide-editor-license";
import { signedInActor } from "@/lib/installation";
import { installationHref } from "@ziffr/core/admin-address";

/** Read on every request: a saved key works without a restart or a new build. */
export const dynamic = "force-dynamic";

/** `{ key, admin, settings }`: the key in effect or null, whether to offer the way to the setting, and that way (only
 * to an Installation Admin). */
export async function GET() {
  const key = slideEditorLicenseKey((await settingsInEffect()).ZIFFR_TLDRAW_LICENSE_KEY);
  // Who asks matters only for the link; when that cannot be told, no link.
  const admin = await signedInActor().then((a) => (a ? isInstallationAdmin(a) : false)).catch(() => false);
  return NextResponse.json({ key, admin, ...(admin ? { settings: installationHref("/installation#slides") } : {}) }, { headers: { "Cache-Control": "no-store" } });
}
