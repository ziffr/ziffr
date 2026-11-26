// GLOSSARY: Installed app, Appearance. The meta tags that colour the browser around the page (the phone's status bar,
// an installed app's title bar). The root layout draws them rather than Next's `viewport` export, because the colour
// follows the person's Appearance, which only the page knows.
import { themeColours } from "@/lib/app-colours";
import type { Appearance } from "@ziffr/core/appearance";

/** One theme colour for a light device and one for a dark one; React puts both into the document's head. */
export function ThemeColour({ appearance }: { appearance: Appearance }) {
  const colours = themeColours(appearance);
  return (
    <>
      <meta name="theme-color" media="(prefers-color-scheme: light)" content={colours.light} />
      <meta name="theme-color" media="(prefers-color-scheme: dark)" content={colours.dark} />
    </>
  );
}
