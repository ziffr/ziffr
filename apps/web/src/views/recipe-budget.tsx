"use client";
// What the Analysis Recipes drawn on one page may ask for together (GLOSSARY: Analysis Recipe, Widget): one budget for a page, made when the
// page's widgets are rendered and charged by each widget in the order it is drawn, so that a page of many recipes cannot hold up the
// server or the browser and what is refused is the same every time. A budget lives in the page's React tree, never in module state.
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { newRecipeBudget, type RecipeBudget } from "@ziffr/core/design-analysis";

const RecipeBudgetContext = createContext<RecipeBudget | null>(null);

/** Gives every widget below it one shared budget; a new one whenever the page's data is another (`data`). */
export function RecipeBudgetProvider({ data, children }: { data: unknown; children: ReactNode }) {
  const budget = useMemo(newRecipeBudget, [data]);
  return <RecipeBudgetContext.Provider value={budget}>{children}</RecipeBudgetContext.Provider>;
}

/** The page's budget, or null outside a page that shares one (a widget on its own has the recipe's own budget). */
export const useRecipeBudget = () => useContext(RecipeBudgetContext);
