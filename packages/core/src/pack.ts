// The Pack format, ziffr.pack/1 (GLOSSARY: Pack): the format lives in @ziffr/pack (MIT), so a creator checks a file exactly as Ziffr does;
// this module holds a Pack to this Ziffr's version: an older Ziffr says which it needs.
import { PACK_ZIFFR_VERSION } from "./ziffr-version";
import { checkPack as check, checkPackValue as checkValue, type PackCheck } from "@ziffr/pack/pack";

export * from "@ziffr/pack/pack";

/** Checks a Pack's text before anything is shown or written, for this Ziffr (`ziffr`, by default what this build is held to). */
export function checkPack(textIn: string, ziffr: string = PACK_ZIFFR_VERSION): PackCheck {
  return check(textIn, ziffr);
}

/** Checks a Pack already read from JSON, for this Ziffr (`ziffr`, by default what this build is held to). */
export function checkPackValue(value: unknown, lines: Map<string, number> = new Map(), ziffr: string = PACK_ZIFFR_VERSION): PackCheck {
  return checkValue(value, lines, ziffr);
}
