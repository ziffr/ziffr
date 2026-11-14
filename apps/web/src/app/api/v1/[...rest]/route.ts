// Any other path under /api/v1 (spec 0002): a JSON 404 in the API's shape, not the app's HTML page. A call that
// sends a key goes through the key's limit and lands in its Access Log like any other call.
import { ApiError, apiError, keyRoute } from "@/lib/api";

const withKey = keyRoute(null, async () => { throw new ApiError("not_found", "No such endpoint."); });
const notFound = async (req: Request) => (req.headers.has("authorization") ? withKey(req, undefined) : apiError("not_found", "No such endpoint."));
/** Unknown endpoints, for every method. */
export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
