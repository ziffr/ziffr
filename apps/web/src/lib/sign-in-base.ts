// Where a sign-in comes back to (ADR 0003; GLOSSARY: Admin Address): this Ziffr's address, or the Admin Address when
// someone signs in there (spec 0066), because a session's cookies belong to the address that made it. Only these two,
// never an address a request names.
import { adminAddress, requestSide } from "@ziffr/core/admin-address";
import { SITE_URL } from "./sign-in";

/** The origin sign-in links and providers lead back to for this request. */
export function signInBase(headers: { get(name: string): string | null }): string {
  const admin = adminAddress();
  return admin.state === "on" && requestSide(headers, admin) === "admin" ? admin.origin : SITE_URL;
}
