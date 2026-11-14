// Any other path under /api/v1 (spec 0002): a JSON 404 in the API's shape, not the app's HTML page.
import { apiError } from "@/lib/api";

const notFound = async () => apiError("not_found", "No such endpoint.");
/** Unknown endpoints, for every method. */
export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
