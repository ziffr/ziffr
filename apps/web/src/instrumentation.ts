// At server start (spec 0025, ticket #196; GLOSSARY: Installation Admin): while the Installation has no Installation
// Admin, a new setup code goes to the server log, and only there. Holding the log proves you run this server.
/** Runs once when the server starts. Only in Node: the edge build must not take the core's mail code along. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { announceSetupCode } = await import("./instrumentation-node");
    await announceSetupCode();
  }
}
