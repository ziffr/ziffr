// The registered Connectors (GLOSSARY: Connector). PROTOTYPE: all simulated; nothing leaves the machine.
import { email } from "./email";
import { slack } from "./slack";
import { tickets } from "./tickets";
import { whatsapp } from "./whatsapp";
import type { Connector, ConnectorId } from "./types";

export const CONNECTORS: Record<ConnectorId, Connector> = { slack, email, whatsapp, tickets };
export const CONNECTOR_IDS = Object.keys(CONNECTORS) as ConnectorId[];
export * from "./types";
