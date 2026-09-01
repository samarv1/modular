export type JsonObject = Record<string, unknown>;

/** Parses a JSON request body and rejects null, arrays, and primitive values. */
export async function readJsonObject(
  request: Request,
): Promise<JsonObject | null> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as JsonObject;
  } catch {
    return null;
  }
}

export function mutationErrorStatus(error: { code?: string }): number {
  if (error.code === "PGRST116") return 404;
  if (error.code === "23503") return 422;
  if (error.code === "22P02") return 400;
  return 500;
}

// The three codes above map to expected, client-meaningful failures (not
// found, FK-restricted, bad input) whose Postgres message is safe and
// useful to return as-is. Anything else is an unexpected DB error whose raw
// message can include column/constraint names — log it and show the client
// a generic message instead.
export function mutationErrorMessage(error: {
  code?: string;
  message: string;
}): string {
  if (
    error.code === "PGRST116" ||
    error.code === "23503" ||
    error.code === "22P02"
  ) {
    return error.message;
  }
  console.error("unexpected db mutation error:", error.code, error.message);
  return "something went wrong";
}

// Used for DB errors from a mutation with no meaningful client-facing
// recovery path (an unexpected write failure, not a validation issue) — the
// route lets this bubble up to Next's default 500 handler, which doesn't log
// it anywhere on its own, so log it here first.
export function throwDbError(error: { message: string; code?: string }): never {
  console.error("unexpected db error:", error.code, error.message);
  throw new Error(error.message);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
