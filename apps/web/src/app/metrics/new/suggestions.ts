// Suggestions for a first Metric (GLOSSARY: Metric Catalog, Setup Guide, Business Function): the few catalog entries
// offered to someone who chose "Explore on my own", picked from what they said in About you, each with one sentence in
// everyday words. Pure and the same every time. It only picks among entries the caller already read, so it can show
// nothing the person may not see; it never makes an entry up.
import type { BusinessFunction } from "@ziffr/pack/business-functions";
import type { Industry, Segment } from "@ziffr/pack/audience";
import type { CatalogMetric, Period } from "@ziffr/core/types";

/** What the person and their Workspace said in About you; every part may be unanswered. */
export type Answers = { function: BusinessFunction | null; industry: Industry | null; segment: Segment | null };

/** One suggested catalog entry with its plain sentence. */
export type Suggestion = { entry: CatalogMetric; line: string };

/** How many are offered: enough to find one, few enough to read. */
export const SUGGESTION_COUNT = 6;

/** How often a value is due, in words. */
export const HOW_OFTEN: Record<Period, string> = { day: "Every day", week: "Every week", month: "Every month", quarter: "Every quarter", year: "Every year" };

/** The sentence shown for each entry that may be suggested, by its name in the Metric Catalog. */
export const PLAIN: Record<string, string> = {
  "Body weight": "What you weigh in the morning.",
  "Running distance": "How far you ran.",
  "Revenue": "What you billed your customers, without VAT.",
  "Cash balance": "How much money is in your bank accounts.",
  "New customers": "People or companies who paid you for the first time.",
  "Customer satisfaction": "The share of asked customers who were happy.",
  "Website visitors": "How many people visited your website.",
  "Deals won": "How many sales you closed successfully.",
  "Qualified leads": "New contacts worth following up.",
  "Sales meetings held": "First meetings with possible new customers.",
  "Pipeline value": "What all your open deals are worth together.",
  "New bookings": "What the contracts you newly signed are worth.",
  "Conversion rate": "The share of visitors who placed an order.",
  "Newsletter subscribers": "How many people get your newsletter.",
  "Marketing spend": "What you paid for ads, events and agencies.",
  "Marketing-qualified leads": "New contacts your marketing found worth passing on.",
  "Social media followers": "How many people follow you on social media.",
  "Cost per lead": "What one new contact costs you in advertising.",
  "Website conversion rate": "The share of website visits that led to a sign-up, enquiry or order.",
  "Operating expenses": "What it costs to run the business, such as salaries and rent.",
  "Net profit": "What is left after all costs and taxes.",
  "Accounts receivable": "Money your customers still owe you.",
  "Overdue receivables": "Unpaid invoices that are past their due date.",
  "Gross margin": "The share of revenue left after the direct costs.",
  "On-time delivery rate": "The share of orders that arrived on time.",
  "Average delivery time": "How many days a delivery takes.",
  "Customer complaints": "How many complaints came in.",
  "Inventory value": "What your stock is worth.",
  "Orders shipped": "How many orders left the warehouse.",
  "Order accuracy": "The share of orders sent with the right items.",
  "Shipping cost per order": "What sending one order costs you.",
  "Sick days": "Days your team was off sick.",
  "New tickets": "How many new requests for help came in.",
  "First response time": "How long customers wait for a first answer.",
  "Support satisfaction": "The share of ratings that called your help good.",
  "Open tickets": "Requests for help that are not solved yet.",
  "Resolution time": "How long it takes to solve a request.",
  "Headcount": "How many people work for you.",
  "Open positions": "Jobs you still want to fill.",
  "New hires": "People who started working for you.",
  "Leavers": "People who left the team.",
  "Time to hire": "How many days it takes to fill a job.",
  "Daily active users": "How many people used your product.",
  "Sign-ups": "How many new accounts were created.",
  "Deployments": "How often you released an update.",
  "Incidents": "Problems with your service that customers noticed.",
  "Uptime": "How much of the time your service was available.",
  "Activation rate": "The share of new users who took the first important step.",
  "Monthly recurring revenue": "What your subscriptions bring in each month.",
  "Churn rate": "The share of subscribers who cancelled.",
  "Cash runway": "How many months your money will last.",
  "Orders": "How many orders were placed.",
  "Online revenue": "Money from online orders.",
  "Average order value": "What a typical order is worth.",
  "Return rate": "The share of items sold that came back.",
  "Sessions": "How many visits your online shop had.",
  "Online review rating": "Your average star rating in public reviews.",
  "Units produced": "How many finished items passed inspection.",
  "Scrap rate": "The share of items that had to be thrown away.",
  "Machine downtime": "Hours your machines stood still without a plan.",
  "Workplace accidents": "How many accidents happened at work.",
  "Billable utilisation": "The share of working hours you can bill to clients.",
  "Capacity utilisation": "How much of your capacity was in use.",
};

/** For someone who said nothing: private and business alike. */
const MIXED = ["Body weight", "Revenue", "Running distance", "New customers", "Cash balance", "Customer satisfaction"];

/** What fills the list when the answers give fewer than enough. */
const ANY_BUSINESS = ["Revenue", "New customers", "Cash balance", "Customer satisfaction", "Website visitors", "Headcount"];

/** By the part of the business the person works in, most wanted first. */
export const BY_FUNCTION: Record<BusinessFunction, readonly string[]> = {
  sales: ["Deals won", "Revenue", "Qualified leads", "New customers", "Sales meetings held", "Pipeline value", "New bookings", "Conversion rate"],
  marketing: ["Website visitors", "Newsletter subscribers", "Marketing spend", "Marketing-qualified leads", "Social media followers", "Cost per lead", "Website conversion rate"],
  finance: ["Revenue", "Cash balance", "Operating expenses", "Net profit", "Accounts receivable", "Gross margin"],
  operations: ["On-time delivery rate", "Average delivery time", "Customer complaints", "Inventory value", "Orders shipped", "Sick days"],
  customer_support: ["New tickets", "First response time", "Support satisfaction", "Open tickets", "Resolution time", "Customer complaints"],
  people: ["Headcount", "Sick days", "Open positions", "New hires", "Leavers", "Time to hire"],
  product_engineering: ["Daily active users", "Sign-ups", "Deployments", "Incidents", "Uptime", "Activation rate"],
  management: ["Revenue", "Cash balance", "Net profit", "New customers", "Customer satisfaction", "Headcount"],
  other: [],
};

const PROFESSIONAL = ["Billable utilisation", "Revenue", "Cash balance", "New customers", "Sales meetings held", "Overdue receivables"];

/** By the Workspace's industry; one without a list of its own gets the general business ones. */
export const BY_INDUSTRY: Partial<Record<Industry, readonly string[]>> = {
  saas: ["Monthly recurring revenue", "Sign-ups", "Churn rate", "Daily active users", "Cash runway", "New customers"],
  ecommerce: ["Orders", "Online revenue", "Average order value", "Return rate", "Sessions", "New customers"],
  retail: ["Revenue", "Orders", "Return rate", "Inventory value", "Customer satisfaction", "Online review rating"],
  wholesale: ["Revenue", "Inventory value", "On-time delivery rate", "Deals won", "Accounts receivable"],
  manufacturing: ["Units produced", "Scrap rate", "Machine downtime", "On-time delivery rate", "Workplace accidents", "Revenue"],
  construction: ["Revenue", "Workplace accidents", "Cash balance", "Overdue receivables", "Headcount"],
  professional_services: PROFESSIONAL,
  agency: PROFESSIONAL,
  hospitality: ["Revenue", "Customer satisfaction", "Online review rating", "Capacity utilisation", "Sick days"],
  logistics: ["Orders shipped", "On-time delivery rate", "Order accuracy", "Shipping cost per order", "Workplace accidents"],
};

/** Whether an entry can be meant for them: never one written for another industry or for other customers. A Workspace
 * that sells to businesses and their customers gets both. */
const fits = (c: CatalogMetric, { industry, segment }: Answers) =>
  (!industry || !c.industries || c.industries.includes(industry)) && (!segment || segment === "b2b2c" || !c.segments || c.segments.includes(segment));

/** The first few catalog entries to offer: their own part of the business and their industry in turn, then general
 * ones. With neither answered, a mix of private and business ones. Names the catalog does not have are passed over. */
export function suggestMetrics(items: readonly CatalogMetric[], answers: Answers): Suggestion[] {
  // The entries every Workspace has come first in the list, so a Pack's entry of the same name does not replace one.
  const byName = new Map<string, CatalogMetric>();
  for (const c of items) if (!byName.has(c.name)) byName.set(c.name, c);
  const own = (answers.function && BY_FUNCTION[answers.function]) || [];
  const industry = (answers.industry && BY_INDUSTRY[answers.industry]) || [];
  const usable = (names: readonly string[]) => names.filter((n) => byName.has(n) && fits(byName.get(n)!, answers));
  const [a, b] = [usable(own), usable(industry)];
  const inTurn = Array.from({ length: Math.max(a.length, b.length) }, (_, i) => [a[i], b[i]]).flat().filter((n): n is string => n !== undefined);
  // An industry or a part of the business is an answer about work; "something else" with no listed industry is not.
  const fill = answers.industry || inTurn.length ? [...ANY_BUSINESS, ...MIXED] : MIXED;
  return [...new Set([...inTurn, ...usable(fill)])].slice(0, SUGGESTION_COUNT).map((n) => ({ entry: byName.get(n)!, line: PLAIN[n] }));
}
