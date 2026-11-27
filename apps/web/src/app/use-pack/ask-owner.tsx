// For someone who may not set a Pack up, or change what one set up, here (spec 0068; GLOSSARY: Pack, Workspace Role).

/** "Ask an Owner or Admin", with the way home. */
export function AskAnOwner() {
  return (
    <main className="mx-auto w-full max-w-xl space-y-4 px-4 py-12">
      <h1 className="text-[length:var(--text-2xl)] leading-tight">Ask an Owner or Admin</h1>
      <p className="text-sm text-muted-foreground">Only an Owner or Admin of this Workspace can set up a Pack.</p>
      {/* A plain link: the app is not drawn around this page, so it is loaded anew. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Go to Home</a>
    </main>
  );
}
