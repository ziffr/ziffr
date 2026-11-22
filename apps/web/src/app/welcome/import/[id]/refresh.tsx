"use client";
// Asks the server for the page again every two seconds while an import runs.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refreshes the progress page until the job ends (the page stops rendering this then). */
export function Refresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 2000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}
