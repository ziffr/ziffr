import "server-only";
import { cookies } from "next/headers";

export const VIEWER_COOKIE = "ziffr-viewer";

export async function viewerId(): Promise<string> {
  return (await cookies()).get(VIEWER_COOKIE)?.value ?? "sara";
}
