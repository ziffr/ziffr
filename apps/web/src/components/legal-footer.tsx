// The legal footer (GLOSSARY: Installation, Ziffr Cloud): imprint, privacy notice and terms, on hosted Ziffr only.
// Where the core says there are no links (every other Installation) it draws nothing. The links are Ziffr's own
// public pages and the same for everybody, so no data of anyone reaches the browser.
import { legalLinks } from "@ziffr/core/legal-links";

const LINK = "underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring";

/** Imprint, Privacy notice and Terms as plain links in a new tab; nothing on an Installation that is not hosted by Ziffr. */
export function LegalFooter({ className = "" }: { className?: string }) {
  const links = legalLinks();
  if (!links) return null;
  return (
    <footer className={`px-4 py-4 text-center text-xs text-muted-foreground sm:px-6 ${className}`}>
      <nav aria-label="Legal" className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        <a href={links.imprint} target="_blank" rel="noopener" className={LINK}>Imprint</a>
        <a href={links.privacy} target="_blank" rel="noopener" className={LINK}>Privacy notice</a>
        <a href={links.terms} target="_blank" rel="noopener" className={LINK}>Terms</a>
      </nav>
    </footer>
  );
}

/** "By signing up you agree to the Terms and the Privacy notice." for the sign-in button where an account can be created; null when not hosted. */
export function SignUpAgreement() {
  const links = legalLinks();
  if (!links) return null;
  return (
    <p className="mt-3 text-center text-xs text-muted-foreground">
      By signing up you agree to the <a href={links.terms} target="_blank" rel="noopener" className={LINK}>Terms</a> and the <a href={links.privacy} target="_blank" rel="noopener" className={LINK}>Privacy notice</a>.
    </p>
  );
}
