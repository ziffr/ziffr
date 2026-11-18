// Whether an API call comes from the remote MCP Server in this process (spec 0023, ADR 0011). An assistant's access
// token is issued for /mcp alone (RFC 8707): the API takes it only on the calls /mcp makes for it in-process
// (api-in-process.ts), never from a program that sends it to /api/v1 itself. Nothing a request carries can set this.
import { AsyncLocalStorage } from "node:async_hooks";

const inside = new AsyncLocalStorage<true>();

/** Runs an API handler as a call from the remote MCP Server. */
export const runFromMcp = <T>(run: () => Promise<T>): Promise<T> => inside.run(true, run);

/** Whether the current API call was made by the remote MCP Server in this process. */
export const calledFromMcp = (): boolean => inside.getStore() === true;
