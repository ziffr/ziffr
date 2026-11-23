// Which columns of the tables a visitor of the demo might one day be let write hold words (GLOSSARY: Demo Mode; spec 0051,
// ticket 6). The database keeps the same list in `demo_words_columns` (migration 20270126130000): a visitor may change
// what the seed made, but not its words, and may not delete what it made in a kept table. This module is the list that
// people edit and tests read: for each candidate table EVERY text-like column (text, jsonb, arrays) is named, as `words`,
// `kept` or `other`, so a table or column nobody classified fails `demo-showcase.db.test.ts` instead of being open by
// accident. Pure: nothing here reads the database or the setting.

/** What the demo's guard knows about one table. */
export type DemoTableWords = {
  /** Columns whose text a visitor reads as the seed's words: names, descriptions, intros, comments. Seeded rows keep them. */
  words: readonly string[];
  /** Columns that keep a seeded row in being or findable (archived, deleted, a slug). Seeded rows keep them as well. */
  kept?: readonly string[];
  /** Every other text-like column, so that a new column cannot pass unseen: identifiers, states, settings, secrets. */
  other: readonly string[];
  /** Whether a seeded row of this table may not be deleted by a visitor, so the demo never misses a part of itself. */
  keepRows?: true;
};

/** The tables behind the server actions that tickets 8 to 11 of spec 0051 open (the inventory's *open* and *open with
 * limits*), each with its columns told apart. A table a later ticket opens must be here first. */
export const DEMO_WORDS_COLUMNS: Readonly<Record<string, DemoTableWords>> = {
  dashboards: { words: ["name", "intro"], other: ["owner_id", "kind", "snapshot_every"], keepRows: true },
  widgets: { words: ["title"], other: ["owner_id", "template", "metric_ids", "settings"] },
  decks: { words: ["name", "footer"], other: ["owner_id", "document"], keepRows: true },
  metrics: {
    words: ["name", "description", "unit"],
    kept: ["slug", "archived_at", "archived_by"],
    other: ["format", "period", "submission_rule", "polarity", "sources", "owner_id", "formula", "aggregation", "unit_position", "attainment_method", "retention", "retention_pending", "retention_cap", "target_min_sealed", "target_max_sealed", "owner_taken_by"],
    keepRows: true,
  },
  workflows: { words: ["name"], other: ["owner_id", "config"], keepRows: true },
  groups: { words: ["name"], other: [], keepRows: true },
  themes: { words: ["name"], other: ["owner_id", "tokens", "slides", "pack_key", "pack_hash", "pack_offer"], keepRows: true },
  team_templates: { words: ["name", "description"], other: ["owner_id", "view", "slots", "body", "kind", "pack_key", "pack_hash", "pack_offer"], keepRows: true },
  tags: { words: ["name", "name_index"], other: ["created_by"], keepRows: true },
  dashboard_snapshots: { words: ["label", "words"], kept: ["deleted_at", "deleted_by"], other: ["period_kind", "taken_by", "shown_by", "frozen"], keepRows: true },
  actions: { words: ["question"], other: ["kind", "status", "asker_id", "assignee_id", "breakdown_label", "purpose", "checklist_item_id", "previous_assignee_id"] },
  thread_messages: { words: ["body"], other: ["author_id", "correction_status", "via", "correction_value_sealed"] },
  series_values: { words: ["note"], other: ["kind", "value_sealed"] },
  period_states: { words: ["note"], other: ["state", "done_steps", "approval_for", "row_key"] },
  prompts: { words: ["text"], other: ["submitter_id", "source", "answered_source", "stands_in_for"] },
  deliveries: {
    words: ["subject", "body"],
    other: ["connector", "recipient_id", "sender_id", "kind", "external_ref", "status", "mail_state", "provider_id", "last_error", "reply_token", "unsubscribe_token", "slack_channel", "slack_ts", "answer_source", "heads_up_key"],
  },
  versions: { words: ["name", "message"], other: ["object_type", "snapshot", "author_id"] },
  observations: { words: [], other: ["submitter_id", "source", "value_sealed", "original_value_sealed", "submitted_by_name", "entered_by", "entered_by_name"] },
  observation_history: { words: [], other: ["submitter_id", "source", "change", "value_sealed", "entered_by"] },
  shares: { words: [], other: ["object_type", "user_id", "role"] },
  group_members: { words: [], other: ["user_id"] },
  access_requests: { words: [], other: ["requester_id", "object_type", "status"] },
  delivery_preferences: { words: [], other: ["user_id", "kind", "connector"] },
  metric_tags: { words: [], other: [] },
  tokens: { words: [], other: ["code", "submitter_id", "stand_in_id", "stands_in_for"] },
  workflow_runs: { words: [], other: ["trigger", "state", "error"] },
};

/** The tables that may one day be opened to visitors. */
export const DEMO_OPEN_CANDIDATES: readonly string[] = Object.keys(DEMO_WORDS_COLUMNS);

/** The `[table, column, kind]` rows the database's `demo_words_columns` holds, in this list's words. */
export function demoWordsColumnRows(): [table: string, column: string, kind: "words" | "kept"][] {
  return Object.entries(DEMO_WORDS_COLUMNS).flatMap(([table, t]) => [
    ...t.words.map((c): [string, string, "words" | "kept"] => [table, c, "words"]),
    ...(t.kept ?? []).map((c): [string, string, "words" | "kept"] => [table, c, "kept"]),
  ]);
}

/** The tables whose seeded rows a visitor may not delete (the database's `demo_kept_rows`). */
export function demoKeptRowTables(): string[] {
  return Object.entries(DEMO_WORDS_COLUMNS).filter(([, t]) => t.keepRows).map(([table]) => table);
}
