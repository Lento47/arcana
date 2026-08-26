/**
 * The generated SDK resolves (does not throw) provider errors unless
 * `{ throwOnError }` is passed, so a settled/expired request surfaces as
 * `result.error` - and thrown variants may arrive as HttpApi error objects.
 * Both shapes identify the engine's "unknown request" 404, which means the
 * gate/form is a phantom (engine restarted or turn aborted) and must be
 * dropped locally.
 *
 * Structural on purpose: matches either the engine body
 * (`{ _tag: "...NotFoundError", requestID }`) or the HTTP client envelope
 * (`{ status: 404, ... }`) without depending on message wording.
 */
export function isUnknownRequestNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const record = error as Record<string, unknown>
  if (typeof record.requestID === "string") return true
  const status = record.status
  return status === 404 || status === "404"
}
