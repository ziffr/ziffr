// A failure of the server itself, not of what a person asked (GLOSSARY: none): the Workspace Key, sealing and the
// database connection. Its words name settings and internals, so nothing that turns the core's refusals into answers
// for people (a server action, the API) shows them: they are logged and answered as a plain failure.

/** A failure of the server's own setup or storage; its message is for the operator's log only. */
export class ServerFault extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerFault";
  }
}
