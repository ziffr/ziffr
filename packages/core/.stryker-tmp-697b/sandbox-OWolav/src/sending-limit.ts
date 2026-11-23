// @ts-nocheck
// The sending limits in effect (ticket #516; GLOSSARY: Installation Settings): the environment first, then what an
// Installation Admin saved on the page, then the default, through the settings in effect (cached a few seconds, so a
// saved value takes effect without a restart). Server only. Values come from sending-limits.ts, which checks them.
import { settingsInEffect } from "./settings-in-effect";
import { sendingLimitFrom, type SendingLimitKey } from "./sending-limits";

/** The value of a sending limit now. Lowering a limit never deletes or switches off anything that exists: callers
 * count what is there and refuse only what would be new. */
export async function sendingLimit(key: SendingLimitKey): Promise<number> {
  return sendingLimitFrom(await settingsInEffect(), key);
}
