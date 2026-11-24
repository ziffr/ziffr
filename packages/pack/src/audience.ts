// Pack Audience (GLOSSARY: Pack Audience; spec 0052): the optional part of a Pack's manifest that says whom the Pack is
// for, so Ziffr can rank Packs for a Workspace and never hide one. The fixed lists live here (MIT) so a Pack author's tools
// check against the same keys the database and the core use; core's Workspace Profile imports them. Security: an audience
// is untrusted input: only keys from these lists get through, sizes are capped, duplicates and unknown parts are refused,
// and nothing in it is rendered as markup or used to build a query (the ranking only compares keys).
import { BUSINESS_FUNCTIONS, type BusinessFunction } from "./business-functions.js";
import type { Schema } from "./json-check.js";

/** Industries a Workspace can pick from; the Metric Catalog tags its Metrics with the same keys. Adding one is a migration. */
export const INDUSTRIES = [
  "saas", "ecommerce", "retail", "wholesale", "manufacturing", "construction", "real_estate", "professional_services",
  "agency", "financial_services", "healthcare", "education", "hospitality", "logistics", "energy", "media",
  "agriculture", "other",
] as const;
/** An industry from INDUSTRIES. */
export type Industry = (typeof INDUSTRIES)[number];

/** Who a business sells to or serves. */
export const SEGMENTS = ["b2b", "b2c", "b2b2c", "public_sector", "non_profit"] as const;
/** A segment from SEGMENTS. */
export type Segment = (typeof SEGMENTS)[number];

/** How many people work there. */
export const EMPLOYEE_BANDS = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;
/** An employee band from EMPLOYEE_BANDS. */
export type EmployeeBand = (typeof EMPLOYEE_BANDS)[number];

/** A year's revenue, in the Workspace currency. */
export const REVENUE_BANDS = ["<1m", "1m-10m", "10m-50m", "50m-250m", "250m-1b", "1b+"] as const;
/** A revenue band from REVENUE_BANDS. */
export type RevenueBand = (typeof REVENUE_BANDS)[number];

/** Every ISO 3166-1 alpha-2 country code, such as DE. */
export const COUNTRIES: readonly string[] = (
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK " +
  "CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS " +
  "GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV " +
  "LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM " +
  "PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR " +
  "TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW"
).split(" ");

/** The parts of an audience, in the order the ranking weighs them. */
export const AUDIENCE_PARTS = ["industries", "functions", "segments", "employeeBands", "revenueBands", "countries"] as const;
/** One part of an audience. */
export type AudiencePart = (typeof AUDIENCE_PARTS)[number];

/** A Pack Audience as the manifest holds it: each part optional, each a list of distinct keys from its fixed list. */
export type PackAudience = {
  industries?: Industry[];
  segments?: Segment[];
  functions?: BusinessFunction[];
  employeeBands?: EmployeeBand[];
  revenueBands?: RevenueBand[];
  /** ISO 3166-1 alpha-2, such as "DE". */
  countries?: string[];
};

/** The most keys a part may name: the list's own length for the short ones, 50 countries. */
export const AUDIENCE_LIMITS = { industries: 18, segments: 5, functions: 9, employeeBands: 6, revenueBands: 6, countries: 50 } as const;

/** The oldest Ziffr that reads an audience: an older one refuses the field as unknown, so a Pack that uses it states a `ziffr` minimum. */
export const AUDIENCE_SINCE = "0.16";

const WHAT: Record<AudiencePart, string> = {
  industries: "an industry", segments: "a segment", functions: "a Business Function", employeeBands: "an employee band", revenueBands: "a revenue band", countries: "an ISO country code such as “DE”",
};
const SETS: Record<AudiencePart, ReadonlySet<string>> = {
  industries: new Set(INDUSTRIES), segments: new Set(SEGMENTS), functions: new Set(BUSINESS_FUNCTIONS), employeeBands: new Set(EMPLOYEE_BANDS), revenueBands: new Set(REVENUE_BANDS), countries: new Set(COUNTRIES),
};

/** The JSON Schema of the `audience` field of a Pack's manifest. Countries are shown as two letters here (the list has 249
 * codes) and checked against the list in `checkAudience`. */
export const AUDIENCE_SCHEMA: Schema = {
  type: "object",
  description: `Whom the Pack is for, so Ziffr can suggest it to a Workspace that fits and rank it higher. It never hides the Pack from anyone. Every part is optional and lists distinct keys from Ziffr's fixed lists; at least one part is needed (leave the field out instead of leaving it empty). A Pack that uses it must state a \`ziffr\` minimum, such as ">=${AUDIENCE_SINCE}", since an older Ziffr refuses the field.`,
  properties: {
    industries: { type: "array", minItems: 1, maxItems: AUDIENCE_LIMITS.industries, uniqueItems: true, items: { enum: [...INDUSTRIES] }, description: "the industries it is for" },
    segments: { type: "array", minItems: 1, maxItems: AUDIENCE_LIMITS.segments, uniqueItems: true, items: { enum: [...SEGMENTS] }, description: "who the business sells to or serves" },
    functions: { type: "array", minItems: 1, maxItems: AUDIENCE_LIMITS.functions, uniqueItems: true, items: { enum: [...BUSINESS_FUNCTIONS] }, description: "the Business Functions it is for" },
    employeeBands: { type: "array", minItems: 1, maxItems: AUDIENCE_LIMITS.employeeBands, uniqueItems: true, items: { enum: [...EMPLOYEE_BANDS] }, description: "how many people work there" },
    revenueBands: { type: "array", minItems: 1, maxItems: AUDIENCE_LIMITS.revenueBands, uniqueItems: true, items: { enum: [...REVENUE_BANDS] }, description: "a year's revenue" },
    countries: { type: "array", minItems: 1, maxItems: AUDIENCE_LIMITS.countries, uniqueItems: true, items: { type: "string", minLength: 2, maxLength: 2 }, description: "ISO 3166-1 alpha-2 country codes, such as “DE”" },
  },
  additionalProperties: false,
};

/** What the schema cannot say about an audience: not empty, countries on the list, and a `ziffr` minimum stated. Reports
 * each problem at its path through `at`. Runs after the schema walk, which has refused wrong types and unknown parts. */
export function checkAudience(audience: PackAudience, ziffr: string | undefined, at: (path: string, message: string) => void): void {
  const parts = AUDIENCE_PARTS.filter((p) => Object.prototype.hasOwnProperty.call(audience, p));
  if (parts.length === 0) at("audience", "is empty: name at least one part, or leave the field out.");
  for (const p of parts) {
    const list = audience[p] as unknown;
    if (Array.isArray(list)) list.forEach((k, i) => { if (typeof k === "string" && !SETS[p].has(k)) at(`audience.${p}[${i}]`, `“${k.slice(0, 40)}” is not ${WHAT[p]}.`); });
  }
  if (ziffr === undefined) at("audience", `needs the field “ziffr” beside it, such as “>=${AUDIENCE_SINCE}”: an older Ziffr refuses an audience.`);
}
