// POST /api/v1/metrics/{slug}/restore (spec 0029; GLOSSARY: Archived Metric): brings an Archived Metric back as the
// key's creator (scope metrics:write). It is asked for and takes values again.
import { archiveRoute } from "@/lib/api-archive";

/** Brings one Metric back (lib/api-archive). */
export const POST = archiveRoute(false);
