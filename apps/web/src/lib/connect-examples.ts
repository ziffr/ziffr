// The examples on Connectors → Send values (GLOSSARY: Feed, Feed Key, Access Key, Metric): what a program or an automation
// sends to put a value on a Metric, written from this Installation's address and a Metric's slug. Pure text: no key is ever
// in it (a placeholder stands where the key goes), nothing is sent from here, and the slug is checked as one before it is
// written, so a name from the Workspace cannot become part of a command.

/** Which key the example is for: a Feed Key sends for a system, an Access Key sends as a person. */
export type ExampleRoute = "feed" | "person";

const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const ADDRESS = /^https?:\/\/[^\s"'\\<>`$]+[^\s"'\\<>`$/]$/;
const PLACEHOLDER_SLUG = "your-metric-slug";

/** The key's placeholder, said in the example. */
export const KEY_PLACEHOLDER: Record<ExampleRoute, string> = { feed: "zk_YOUR_FEED_KEY", person: "YOUR_ACCESS_KEY" };

/** The endpoint for a route and Metric. */
export function endpointOf(address: string, route: ExampleRoute, slug: string): string {
  const trimmed = address.replace(/\/+$/, "");
  const base = ADDRESS.test(trimmed) ? trimmed : "https://YOUR-ZIFFR-ADDRESS";
  return route === "feed" ? `${base}/api/v1/feed/observations` : `${base}/api/v1/metrics/${SLUG.test(slug) ? slug : PLACEHOLDER_SLUG}/observations`;
}

/** The body for a route: a Feed sends a list of items, a person's key one value for the Metric in the address. */
export function bodyOf(route: ExampleRoute, slug: string, value = 42): unknown {
  const s = SLUG.test(slug) ? slug : PLACEHOLDER_SLUG;
  return route === "feed" ? { items: [{ metric: s, value }] } : { value };
}

/** The ways to send it, each as text to copy. `period` is left out on purpose: the current period is the common case. */
export function examplesFor(input: { address: string; route: ExampleRoute; slug: string }): { id: "curl" | "javascript" | "python" | "n8n"; label: string; text: string }[] {
  const url = endpointOf(input.address, input.route, input.slug);
  const body = JSON.stringify(bodyOf(input.route, input.slug));
  const key = KEY_PLACEHOLDER[input.route];
  return [
    { id: "curl", label: "curl", text: `curl -X POST '${url}' \\\n  -H 'Authorization: Bearer ${key}' \\\n  -H 'Content-Type: application/json' \\\n  -H 'Idempotency-Key: my-system-2026-10-01' \\\n  -d '${body}'` },
    { id: "javascript", label: "JavaScript", text: `const res = await fetch("${url}", {\n  method: "POST",\n  headers: {\n    Authorization: "Bearer ${key}",\n    "Content-Type": "application/json",\n    "Idempotency-Key": "my-system-2026-10-01", // a retry with the same key records nothing twice\n  },\n  body: JSON.stringify(${body}),\n});\nconst answer = await res.json();\nif (!res.ok) throw new Error(answer.error.message); // the request was wrong: nothing was recorded${input.route === "feed" ? "\nfor (const r of answer.results) if (r.status === \"refused\") console.error(r.metric, r.code, r.detail); // one item refused: the others ran" : ""}` },
    { id: "python", label: "Python", text: `import requests\n\nres = requests.post(\n    "${url}",\n    headers={"Authorization": "Bearer ${key}", "Idempotency-Key": "my-system-2026-10-01"},\n    json=${body},\n    timeout=30,\n)\nanswer = res.json()\nif not res.ok:\n    raise RuntimeError(answer["error"]["message"])  # the request was wrong: nothing was recorded${input.route === "feed" ? "\nfor r in answer[\"results\"]:\n    if r[\"status\"] == \"refused\":\n        print(r[\"metric\"], r[\"code\"], r[\"detail\"])  # one item refused: the others ran" : ""}` },
    { id: "n8n", label: "n8n / Zapier", text: `HTTP Request node\nMethod:  POST\nURL:     ${url}\nAuthentication: Header Auth (name Authorization, value Bearer ${key}); keep the key in the credential\nHeader:  Idempotency-Key = my-system-{{ $now.toFormat('yyyy-MM-dd') }}\nBody (JSON): ${body}` },
  ];
}
