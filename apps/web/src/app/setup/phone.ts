// Class strings the Setup Guide's steps share so each is a comfortable target on a phone (spec 0052; GLOSSARY: Setup Guide):
// 44 px tall, 16 px text in fields (iOS Safari zooms in on anything smaller), full-width buttons that stack; from the
// small breakpoint they are the compact desktop sizes again.

/** A select or text field: 44 px and 16 px text on a phone, compact from 640 px. */
export const PHONE_FIELD = "h-11 w-full rounded-[var(--radius-input)] border border-input bg-card px-2 text-base disabled:opacity-70 sm:h-9 sm:w-auto sm:text-sm";
/** A button: full width and 44 px on a phone. */
export const PHONE_BUTTON = "h-11 w-full sm:h-9 sm:w-auto";
/** A small button (a card's action): full width and 44 px on a phone, 32 px from 640 px. */
export const PHONE_BUTTON_SM = "h-11 w-full sm:h-8 sm:w-auto";
/** A link that looks like an outline button, at the same sizes as PHONE_BUTTON_SM. */
export const PHONE_LINK_BUTTON = "inline-flex h-11 w-full items-center justify-center rounded-[var(--radius-input)] border border-input px-3 text-sm font-medium hover:bg-muted sm:h-8 sm:w-auto";
/** A text link inside a sentence: 44 px to tap on a phone. */
export const PHONE_TEXT_LINK = "inline-flex min-h-11 items-center self-start underline sm:min-h-0";
/** Buttons stacked on a phone, the main one first; in a row, right-aligned, from 640 px. */
export const PHONE_ACTIONS = "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center";
/** The footer's Skip and go-on buttons: the main one on top on a phone, Skip first from 640 px. */
export const PHONE_FOOTER = "flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end";
