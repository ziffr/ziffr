// POST /api/v1/metrics/{slug}/archive (spec 0029; GLOSSARY: Archived Metric): archives a Metric as the key's creator
// (scope metrics:write). Its values and history stay; it asks for nothing and takes no values.
import { archiveRoute } from "@/lib/api-archive";

/** Archives one Metric (lib/api-archive). */
export const POST = archiveRoute(true);
