// Sign-in settings shared by the login page, the callback and the actions (ADR 0003).

/** The providers Ziffr can offer, by their Supabase names: Google, Microsoft, GitHub, LinkedIn. */
export type Provider = "google" | "azure" | "github" | "linkedin_oidc";

/** How each provider is named on the login page. */
export const PROVIDER_LABEL: Record<Provider, string> = { google: "Google", azure: "Microsoft", github: "GitHub", linkedin_oidc: "LinkedIn" };

/** Where Ziffr is reached; sign-in links lead back here. */
export const SITE_URL = (process.env.ZIFFR_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** The providers that are set up (ZIFFR_AUTH_PROVIDERS, comma separated); none means email links only. */
export function enabledProviders(): Provider[] {
  const known = Object.keys(PROVIDER_LABEL) as Provider[];
  return (process.env.ZIFFR_AUTH_PROVIDERS ?? "").split(",").map((s) => s.trim()).filter((s): s is Provider => known.includes(s as Provider));
}

/** Where to go after signing in: only a path inside Ziffr, never another site. */
export function safeNext(next: string | null | undefined): string {
  const n = String(next ?? "");
  return n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/\\") ? n : "/";
}
