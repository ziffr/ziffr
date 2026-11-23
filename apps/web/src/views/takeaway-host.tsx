"use client";
// Where a Widget's Takeaway words go (GLOSSARY: Takeaway, Widget). A card says: "hidden" (a View Link, a Preview, a
// Snapshot's dashboard: the chart and its footer line only) or "panel" (a dashboard Widget: the words open from its ⋯
// menu). No host (a deck's slide) draws the words under the chart as always. The words are the same in every case and
// the browser receives nothing more than before: this only decides where they are drawn.
import { createContext, useContext } from "react";

/** Where a Widget's Takeaways are drawn: not at all, or in a panel the card opens. */
export type TakeawayHost = { mode: "hidden" } | { mode: "panel"; open: boolean; setOpen: (open: boolean) => void; setHas: (has: boolean) => void };

const TakeawayHostContext = createContext<TakeawayHost | null>(null);

/** Set by a Widget's card. */
export const TakeawayHostProvider = TakeawayHostContext.Provider;

/** The card's host for Takeaways; null outside a card (a deck's slide), where they stay under the chart. */
export const useTakeawayHost = () => useContext(TakeawayHostContext);

/** Shared so a card that never shows the words keeps one value. */
export const HIDDEN_TAKEAWAYS: TakeawayHost = { mode: "hidden" };
