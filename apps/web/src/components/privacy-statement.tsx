// The privacy statement of the Workspace Profile and the Business Function (spec 0052; GLOSSARY: Workspace Profile,
// Business Function): one wording, shown on the Setup Guide's About you and on Workspace -> General, and repeated in the
// user guide. It says where the answers stay; the core is what keeps the promise.

/** The words, exactly as the spec has them. */
export const PRIVACY_STATEMENT =
  "What you answer here stays in this Workspace. It is not sent to Ziffr's makers or to anyone else, and it is used only to suggest Metrics and Packs here and who is asked for what. Owners and Admins of this Workspace see your function; other members do not.";

/** The statement as a paragraph. */
export function PrivacyStatement({ className }: { className?: string }) {
  return <p className={className ?? "text-sm text-muted-foreground"}>{PRIVACY_STATEMENT}</p>;
}
