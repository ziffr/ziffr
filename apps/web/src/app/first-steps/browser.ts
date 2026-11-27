// What the browser knows about the person's day and money, and the names it shows them by (spec 0067; GLOSSARY: First
// Steps, Workspace Profile). The server checks every value again.
import type { FirstStepsAnswers } from "@ziffr/core/first-steps-screens";
import { COUNTRIES, currencyFor } from "@ziffr/core/workspace-profile";

type LocaleWithWeek = Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };

/** Time zone, country, currency and first weekday as the browser's settings give them; null where they say nothing.
 * The country comes only from a region the language names, never from a guess. */
export function browserDefaults(language: string, zone: string | undefined): Pick<FirstStepsAnswers, "timeZone" | "country" | "currency" | "weekStart"> {
  let locale: LocaleWithWeek | null = null;
  try { locale = new Intl.Locale(language) as LocaleWithWeek; } catch { /* a language tag the browser cannot read */ }
  const country = locale?.region && COUNTRIES.includes(locale.region) ? locale.region : null;
  const day = (locale?.getWeekInfo?.() ?? locale?.weekInfo)?.firstDay;
  return { timeZone: zone && timeZones(null).includes(zone) ? zone : null, country, currency: country ? currencyFor(country) : null, weekStart: day === undefined ? null : day === 7 ? 0 : 1 };
}

/** The time zones this browser knows, UTC first, and the current one even when the browser does not list it. */
export function timeZones(current: string | null): string[] {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return [...new Set(["UTC", ...(current ? [current] : []), ...all])];
}

function named(type: "region" | "currency", code: string): string {
  try { return new Intl.DisplayNames(["en"], { type }).of(code) ?? code; } catch { return code; }
}
/** A country's name. */
export const countryName = (code: string) => named("region", code);
/** A currency's name and code, such as "Euro (EUR)". */
export const currencyName = (code: string) => `${named("currency", code)} (${code})`;
