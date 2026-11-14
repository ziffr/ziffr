// The Workspace Profile (spec 0006, ticket #97; GLOSSARY: Workspace Profile): what kind of business a workspace
// belongs to, each part picked from a fixed list. Pure: the lists, and the check of one value against them.

/** Industries a workspace can pick from: short enough to choose in one look. The Metric Catalog tags its Metrics
 * with the same keys, so suggestions can be filtered by a workspace's industry; keep them spelled alike. */
export const INDUSTRIES = [
  "saas", "ecommerce", "retail", "wholesale", "manufacturing", "construction", "real_estate", "professional_services",
  "agency", "financial_services", "healthcare", "education", "hospitality", "logistics", "energy", "media",
  "agriculture", "other",
] as const;
/** An industry from INDUSTRIES. */
export type Industry = (typeof INDUSTRIES)[number];

/** What each industry is called in the app. */
export const INDUSTRY_LABEL: Record<Industry, string> = {
  saas: "Software and SaaS", ecommerce: "E-commerce", retail: "Retail", wholesale: "Wholesale and distribution",
  manufacturing: "Manufacturing", construction: "Construction", professional_services: "Consulting and professional services",
  agency: "Agencies (marketing, design, development)",
  financial_services: "Finance and insurance", healthcare: "Health and care", education: "Education",
  hospitality: "Hospitality, food and travel", real_estate: "Real estate", logistics: "Transport and logistics",
  energy: "Energy and utilities", media: "Media and entertainment", agriculture: "Agriculture and food production", other: "Something else",
};

/** Who a workspace's business sells to or serves. */
export const SEGMENTS = ["b2b", "b2c", "b2b2c", "public_sector", "non_profit"] as const;
/** A segment from SEGMENTS. */
export type Segment = (typeof SEGMENTS)[number];

/** What each segment is called in the app. */
export const SEGMENT_LABEL: Record<Segment, string> = {
  b2b: "Businesses (B2B)", b2c: "Consumers (B2C)", b2b2c: "Businesses and their customers (B2B2C)", public_sector: "Public sector", non_profit: "Non-profit",
};

/** How many people work there. */
export const EMPLOYEE_BANDS = ["1-10", "11-50", "51-200", "201-500", "501-1000", "1000+"] as const;
/** An employee band from EMPLOYEE_BANDS. */
export type EmployeeBand = (typeof EMPLOYEE_BANDS)[number];

/** A year's revenue, in the workspace currency. */
export const REVENUE_BANDS = ["<1m", "1m-10m", "10m-50m", "50m-250m", "250m-1b", "1b+"] as const;
/** A revenue band from REVENUE_BANDS. */
export type RevenueBand = (typeof REVENUE_BANDS)[number];

/** What each revenue band is called in the app, before the currency. */
export const REVENUE_LABEL: Record<RevenueBand, string> = {
  "<1m": "Under 1 million", "1m-10m": "1 to 10 million", "10m-50m": "10 to 50 million", "50m-250m": "50 to 250 million", "250m-1b": "250 million to 1 billion", "1b+": "Over 1 billion",
};

// Every ISO 3166-1 alpha-2 country with the ISO 4217 currency it uses (the main one where there are several).
const COUNTRY_CURRENCY = Object.fromEntries((
  "AD:EUR AE:AED AF:AFN AG:XCD AI:XCD AL:ALL AM:AMD AO:AOA AQ:USD AR:ARS AS:USD AT:EUR AU:AUD AW:AWG AX:EUR " +
  "AZ:AZN BA:BAM BB:BBD BD:BDT BE:EUR BF:XOF BG:EUR BH:BHD BI:BIF BJ:XOF BL:EUR BM:BMD BN:BND BO:BOB BQ:USD " +
  "BR:BRL BS:BSD BT:BTN BV:NOK BW:BWP BY:BYN BZ:BZD CA:CAD CC:AUD CD:CDF CF:XAF CG:XAF CH:CHF CI:XOF CK:NZD " +
  "CL:CLP CM:XAF CN:CNY CO:COP CR:CRC CU:CUP CV:CVE CW:ANG CX:AUD CY:EUR CZ:CZK DE:EUR DJ:DJF DK:DKK DM:XCD " +
  "DO:DOP DZ:DZD EC:USD EE:EUR EG:EGP EH:MAD ER:ERN ES:EUR ET:ETB FI:EUR FJ:FJD FK:FKP FM:USD FO:DKK FR:EUR " +
  "GA:XAF GB:GBP GD:XCD GE:GEL GF:EUR GG:GBP GH:GHS GI:GIP GL:DKK GM:GMD GN:GNF GP:EUR GQ:XAF GR:EUR GS:GBP " +
  "GT:GTQ GU:USD GW:XOF GY:GYD HK:HKD HM:AUD HN:HNL HR:EUR HT:HTG HU:HUF ID:IDR IE:EUR IL:ILS IM:GBP IN:INR " +
  "IO:USD IQ:IQD IR:IRR IS:ISK IT:EUR JE:GBP JM:JMD JO:JOD JP:JPY KE:KES KG:KGS KH:KHR KI:AUD KM:KMF KN:XCD " +
  "KP:KPW KR:KRW KW:KWD KY:KYD KZ:KZT LA:LAK LB:LBP LC:XCD LI:CHF LK:LKR LR:LRD LS:LSL LT:EUR LU:EUR LV:EUR " +
  "LY:LYD MA:MAD MC:EUR MD:MDL ME:EUR MF:EUR MG:MGA MH:USD MK:MKD ML:XOF MM:MMK MN:MNT MO:MOP MP:USD MQ:EUR " +
  "MR:MRU MS:XCD MT:EUR MU:MUR MV:MVR MW:MWK MX:MXN MY:MYR MZ:MZN NA:NAD NC:XPF NE:XOF NF:AUD NG:NGN NI:NIO " +
  "NL:EUR NO:NOK NP:NPR NR:AUD NU:NZD NZ:NZD OM:OMR PA:PAB PE:PEN PF:XPF PG:PGK PH:PHP PK:PKR PL:PLN PM:EUR " +
  "PN:NZD PR:USD PS:ILS PT:EUR PW:USD PY:PYG QA:QAR RE:EUR RO:RON RS:RSD RU:RUB RW:RWF SA:SAR SB:SBD SC:SCR " +
  "SD:SDG SE:SEK SG:SGD SH:SHP SI:EUR SJ:NOK SK:EUR SL:SLE SM:EUR SN:XOF SO:SOS SR:SRD SS:SSP ST:STN SV:USD " +
  "SX:ANG SY:SYP SZ:SZL TC:USD TD:XAF TF:EUR TG:XOF TH:THB TJ:TJS TK:NZD TL:USD TM:TMT TN:TND TO:TOP TR:TRY " +
  "TT:TTD TV:AUD TW:TWD TZ:TZS UA:UAH UG:UGX UM:USD US:USD UY:UYU UZ:UZS VA:EUR VC:XCD VE:VES VG:USD VI:USD " +
  "VN:VND VU:VUV WF:XPF WS:WST YE:YER YT:EUR ZA:ZAR ZM:ZMW ZW:ZWG"
).split(" ").map((p) => p.split(":") as [string, string]));

/** Every ISO 3166-1 alpha-2 country code, such as DE. */
export const COUNTRIES: readonly string[] = Object.keys(COUNTRY_CURRENCY);

/** The ISO 4217 currencies a country uses as its own, such as EUR. */
export const CURRENCIES: readonly string[] = [...new Set(Object.values(COUNTRY_CURRENCY))].sort();

/** The currency a country uses, to propose when a workspace picks its country; null for an unknown code. */
export function currencyFor(country: string): string | null {
  return Object.hasOwn(COUNTRY_CURRENCY, country) ? COUNTRY_CURRENCY[country] : null;
}

/** What kind of business a workspace belongs to. Every field is null until someone sets it; read null as "any". */
export type WorkspaceProfile = {
  industry: Industry | null;
  segment: Segment | null;
  /** ISO 3166-1 alpha-2, such as "DE". */
  country: string | null;
  /** ISO 4217, such as "EUR". */
  currency: string | null;
  employeeBand: EmployeeBand | null;
  /** A year's revenue, in `currency`. */
  revenueBand: RevenueBand | null;
};

/** The fields of a Workspace Profile with the list each one is checked against. */
export const PROFILE_FIELDS: { [K in keyof WorkspaceProfile]: readonly string[] } = {
  industry: INDUSTRIES, segment: SEGMENTS, country: COUNTRIES, currency: CURRENCIES, employeeBand: EMPLOYEE_BANDS, revenueBand: REVENUE_BANDS,
};

/** A Workspace Profile from untrusted input, or the first field that is not on its list. Missing and empty fields
 * become null; nothing outside the lists gets through. */
export function checkProfile(input: unknown): { ok: true; profile: WorkspaceProfile } | { ok: false; field: keyof WorkspaceProfile } {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const out: Record<string, string | null> = {};
  for (const [field, list] of Object.entries(PROFILE_FIELDS) as [keyof WorkspaceProfile, readonly string[]][]) {
    const v = raw[field];
    if (v === undefined || v === null || v === "") out[field] = null;
    else if (typeof v === "string" && list.includes(v)) out[field] = v;
    else return { ok: false, field };
  }
  return { ok: true, profile: out as WorkspaceProfile };
}
