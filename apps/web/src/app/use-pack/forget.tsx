"use client";
// Drops the answers a guided Pack set-up kept in this tab (spec 0068; GLOSSARY: Pack). It stands on the sign-in page,
// where every way of signing out ends, so the names and addresses someone typed do not stay for whoever signs in next.
import { useEffect } from "react";
import { dropAllDrafts } from "./draft";

/** Nothing to see: forgets on arrival. */
export function ForgetSetUpAnswers() {
  useEffect(() => dropAllDrafts(), []);
  return null;
}
