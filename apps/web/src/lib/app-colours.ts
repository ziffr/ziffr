// The installed web app's colours (#143), from the design tokens in app/tokens.css; app-colours.test.ts keeps them
// equal. Hex, because not every browser reads oklch() in a manifest.

/** The colours of the installed app: the manifest's, and the browser's around the page. */
export const APP_COLOURS = {
  // --color-paper: the page background, shown while Ziffr starts and behind the phone's status bar.
  background: "#f8f4f1",
};
