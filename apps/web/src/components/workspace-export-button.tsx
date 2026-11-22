// The download of a Workspace Export (spec 0040, ticket 8; GLOSSARY: Workspace Export): a form that posts to the
// download, or, when the Owner signed in too long ago, a button that signs them in again. Shared by the Export page and
// the screen of an ended trial, which has no other page.
import { Button } from "@/components/ui/button";
import { signInAgainForExport } from "@/app/auth-actions";

/** The download button when the Owner signed in within the last 10 minutes, else the one that asks for a new sign-in. */
export function WorkspaceExportButton({ signedInRecently, variant = "default" }: { signedInRecently: boolean; variant?: "default" | "outline" }) {
  // A POST, never a link: a page elsewhere cannot start a download by sending the browser to it.
  if (signedInRecently) return <form method="post" action="/settings/export/download"><Button type="submit" variant={variant}>Download the Workspace Export</Button></form>;
  return <form action={signInAgainForExport}><Button type="submit" variant={variant}>Sign in again to download</Button></form>;
}
