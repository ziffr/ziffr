// The installed app's colours (#143; GLOSSARY: Installed app), from the design tokens in app/tokens.css and
// app/appearance.css; installable.test.ts keeps them equal. Hex, because not every browser reads oklch() in a manifest.
import type { Appearance } from "@ziffr/core/appearance";

/** The colours of the installed app: the manifest's, and the browser's around the page. */
export const APP_COLOURS = {
  // --color-paper: the page background, shown while Ziffr starts and behind the phone's status bar.
  background: "#f8f4f1",
  // --color-paper of the Dark Appearance (app/appearance.css).
  backgroundDark: "#14100d",
  // --color-paper of the High contrast Appearance on a device set to light, and on one set to dark.
  backgroundContrast: "#ffffff",
  backgroundContrastDark: "#000000",
};

/** The colour the browser draws around the page (status bar, title bar) on a light and on a dark device, so that it
 * matches the page in the person's Appearance and not only the device's setting. */
export function themeColours(appearance: Appearance): { light: string; dark: string } {
  const { background, backgroundDark, backgroundContrast, backgroundContrastDark } = APP_COLOURS;
  return {
    system: { light: background, dark: backgroundDark },
    light: { light: background, dark: background },
    dark: { light: backgroundDark, dark: backgroundDark },
    contrast: { light: backgroundContrast, dark: backgroundContrastDark },
  }[appearance];
}
