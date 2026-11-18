"use client";
// Registers the service worker that makes Ziffr installable (#143; public/sw.js says what it may cache). Only in
// production builds: in development a worker would outlive code changes and get in the way of hot reloading.
import { useEffect } from "react";

/** Registers public/sw.js once the page has loaded; draws nothing. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    // updateViaCache "none": a new sw.js is fetched from the server on every check, never from the HTTP cache.
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Without the worker Ziffr still works, only without the offline page.
    });
  }, []);
  return null;
}
