// Business Functions (GLOSSARY: Business Function; spec 0052): the fixed list of the parts of a business a person
// works in. It lives in @ziffr/pack (MIT) so a Pack's audience can name the same keys the database and the core use.
// Adding a key is a migration and a change here, never a rename.

/** The keys of the Business Function list, in the order people are shown them. */
export const BUSINESS_FUNCTIONS = ["sales", "marketing", "finance", "operations", "customer_support", "people", "product_engineering", "management", "other"] as const;

/** One Business Function key. */
export type BusinessFunction = (typeof BUSINESS_FUNCTIONS)[number];

/** How each Business Function is written on screen. */
export const BUSINESS_FUNCTION_LABELS: Record<BusinessFunction, string> = {
  sales: "Sales",
  marketing: "Marketing",
  finance: "Finance",
  operations: "Operations",
  customer_support: "Customer support",
  people: "People and HR",
  product_engineering: "Product and engineering",
  management: "Management",
  other: "Something else",
};

const KEYS: ReadonlySet<string> = new Set(BUSINESS_FUNCTIONS);

/** Whether a value, from anywhere, is exactly one key of the list. Never true for inherited names such as `__proto__`. */
export function isBusinessFunction(value: unknown): value is BusinessFunction {
  return typeof value === "string" && KEYS.has(value);
}
