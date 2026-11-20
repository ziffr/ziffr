// Demo Mode's settings (GLOSSARY: Demo Mode, ADR 0005): whether this Ziffr offers the demo, and whether it is a public
// demo and nothing else. Whether it is offered is an Installation Setting (spec 0025), read from the settings in
// effect; demo-only stays the server's, since it also stops Auth from making accounts. Free of the server-only session
// code in ./auth.ts, which re-exports them, so route handlers and their tests use them.
import { settingsInEffect } from "@ziffr/core/settings-in-effect";

/** Whether this Ziffr is a public demo and nothing else (ZIFFR_DEMO_ONLY=1): nobody signs in or makes an account, and
 * the login page offers only the demo. For an Installation anyone on the internet may try. */
export const demoOnly = () => process.env.ZIFFR_DEMO_ONLY === "1";

/** Whether this Ziffr offers the demo. On unless ZIFFR_DEMO=0 (the environment, else the Installation settings page,
 * else Docker's default), so a company installation can switch it off; always on in a demo-only Ziffr. */
export const demoEnabled = async (): Promise<boolean> => demoOnly() || (await settingsInEffect()).ZIFFR_DEMO !== "0";
