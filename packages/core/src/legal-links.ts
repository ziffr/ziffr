// Legal links (GLOSSARY: Installation, Ziffr Cloud): imprint, privacy notice and terms are Ziffr's own pages and are
// shown on hosted Ziffr only. A self-hosted or operator Installation shows none and has no setting for them: the
// operator publishes their own notices. The signal is the one trials use (a Ziffr Cloud key), nothing new.
import { hostedByCloud } from "./installation-days";

/** The legal pages of Ziffr, which hosted Ziffr links to. */
export type LegalLinks = { imprint: string; privacy: string; terms: string };

const ZIFFR_LEGAL: LegalLinks = {
  imprint: "https://ziffr.net/impressum",
  privacy: "https://ziffr.net/datenschutz/app",
  terms: "https://ziffr.net/terms",
};

/** Ziffr's legal links on hosted Ziffr, and null everywhere else (including when unsure: no key, no links). Installation-wide, so it takes no Actor and returns no data of anyone. */
export function legalLinks(env: Record<string, string | undefined> = process.env): LegalLinks | null {
  try {
    return hostedByCloud(env) ? ZIFFR_LEGAL : null;
  } catch {
    return null;
  }
}
