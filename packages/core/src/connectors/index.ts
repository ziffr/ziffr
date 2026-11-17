// The registered Connectors (GLOSSARY: Connector). Email is real once mail is set up (spec 0004, ../mail.ts), Slack
// once a workspace connects it (spec 0007, ../slack-send.ts), Telegram once a workspace turns it on and a person
// connects their own (spec 0016, ../telegram-send.ts); WhatsApp and the ticket system are simulated: their
// Deliveries are recorded in the Outbox, and nothing leaves.
import { email } from "./email";
import { slack } from "./slack";
import { telegram } from "./telegram";
import { tickets } from "./tickets";
import { whatsapp } from "./whatsapp";
import type { Connector, ConnectorId } from "./types";

/** Every registered Connector by id. */
export const CONNECTORS: Record<ConnectorId, Connector> = { slack, email, telegram, whatsapp, tickets };
/** The ids of the registered Connectors. */
export const CONNECTOR_IDS = Object.keys(CONNECTORS) as ConnectorId[];
export * from "./types";
