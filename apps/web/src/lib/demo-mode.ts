// Demo Mode's settings (GLOSSARY: Demo Mode, ADR 0005): whether this Ziffr offers the demo, and whether it is a public
// demo and nothing else. Plain reads of the environment, so route handlers and their tests use them without the
// server-only session code in ./auth.ts, which re-exports them.

/** Whether this Ziffr is a public demo and nothing else (ZIFFR_DEMO_ONLY=1): nobody signs in or makes an account, and
 * the login page offers only the demo. For an Installation anyone on the internet may try. */
export const demoOnly = () => process.env.ZIFFR_DEMO_ONLY === "1";

/** Whether this Ziffr offers the demo. On unless ZIFFR_DEMO=0, so a company installation can switch it off; always on
 * in a demo-only Ziffr. */
export const demoEnabled = () => demoOnly() || process.env.ZIFFR_DEMO !== "0";
