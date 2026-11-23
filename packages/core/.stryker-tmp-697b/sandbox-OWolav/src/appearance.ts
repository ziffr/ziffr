// @ts-nocheck
// Appearance (#505; GLOSSARY: Appearance): how Ziffr's own screens are drawn for one person. Pure: the web app's
// client code imports it too. It is a preference and says nothing about who may see what.

/** The choices: follow the device, always light, always dark, or high contrast (light or dark as the device is set). */
export const APPEARANCES = ["system", "light", "dark", "contrast"] as const;

/** One of the choices. */
export type Appearance = (typeof APPEARANCES)[number];

/** Name of the cookie that keeps the choice in a browser, for screens that have no signed-in person (sign-in, demo). */
export const APPEARANCE_COOKIE = "ziffr-appearance";

/** What each choice is called on the Appearance page, with a line saying what it does. */
export const APPEARANCE_WORDS: Record<Appearance, { label: string; hint: string }> = {
  system: { label: "System", hint: "Light or dark, as this device is set." },
  light: { label: "Light", hint: "Always light." },
  dark: { label: "Dark", hint: "Always dark." },
  contrast: { label: "High contrast", hint: "Black on white, or white on black when the device is set to dark, with strong outlines." },
};

/** The choice a stored or sent value stands for; anything else is System. */
export function parseAppearance(value: unknown): Appearance {
  return (APPEARANCES as readonly unknown[]).includes(value) ? (value as Appearance) : "system";
}
