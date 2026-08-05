/**
 * Engine-side adapter over `SafeBoundedFileReader` (D-7.1 containment).
 *
 * The read tool's production content reads must route through the bounded,
 * handle-relative containment reader so hostile-escape fixtures hold at the
 * real boundary, not just in the core unit suite. This adapter:
 *
 * - validates the requested path lexically (null bytes, `..` traversal,
 *   empty path) before any filesystem call, mirroring the reader's own
 *   `validatePath` so rejections are typed and fail closed;
 * - runs `SafeBoundedFileReader` against the caller-provided boundary root
 *   and converts every failed read into a typed `BoundedFileReadRejected`
 *   instead of an untyped fs error.
 *
 * The caller is responsible for choosing the boundary root (worktree /
 * directory / approved external directory) and passing a path relative to
 * it. The adapter stays generic so other engine file-read paths can reuse it.
 */

import { Effect, Schema } from "effect"
import { SafeBoundedFileReader } from "@arcana/core/crypto/bounded-file-reader"

export type BoundedReadStage =
  | "PATH_VALIDATION"
  | "RESOLUTION"
  | "OPEN"
  | "STAT"
  | "READ"
  | "CONTAINMENT"
  | "IDENTITY"

export class BoundedFileReadRejected extends Schema.TaggedErrorClass<BoundedFileReadRejected>()(
  "BoundedFileReadRejected",
  {
    reason: Schema.String,
    stage: Schema.String,
    message: Schema.String,
  },
) {}

export type BoundedReadInput = {
  /** Canonical root the read must stay inside (worktree, directory, or approved external dir). */
  readonly boundaryRoot: string
  /** Path relative to `boundaryRoot`. */
  readonly requestedPath: string
  /** Byte budget; files larger than this fail closed. */
  readonly maximumBytes: number
}

/**
 * Lexical validation mirroring `SafeBoundedFileReader`'s `validatePath`.
 * Null bytes, `..` traversal components, and empty paths are rejected.
 * Absolute paths are intentionally NOT rejected here: the engine resolves
 * them against the instance boundary before the reader sees them, so an
 * absolute path inside the boundary is legitimate.
 */
export function validateBoundedPath(requestedPath: string): { valid: true } | { valid: false; reason: string } {
  if (requestedPath.includes("\0")) {
    return { valid: false, reason: `path contains null byte: ${JSON.stringify(requestedPath)}` }
  }
  const parts = requestedPath.split(/[/\\]/)
  for (const part of parts) {
    if (part === "..") {
      return { valid: false, reason: `path traversal detected: ${requestedPath}` }
    }
  }
  if (requestedPath.length === 0) {
    return { valid: false, reason: "empty path" }
  }
  return { valid: true }
}

export function boundedReadRejected(reason: string, stage: BoundedReadStage): BoundedFileReadRejected {
  return new BoundedFileReadRejected({ reason, stage, message: `${reason} (${stage})` })
}

/**
 * Read a file through `SafeBoundedFileReader` and fail closed with a typed
 * `BoundedFileReadRejected` on any containment, validation, or size failure.
 */
export const readBoundedFile = Effect.fn("Filesystem.readBoundedFile")(function* (input: BoundedReadInput) {
  const check = validateBoundedPath(input.requestedPath)
  if (!check.valid) {
    return yield* Effect.fail(boundedReadRejected(check.reason, "PATH_VALIDATION"))
  }

  const reader = new SafeBoundedFileReader()
  const result = yield* Effect.tryPromise({
    try: () =>
      reader.read({
        workspaceRoot: input.boundaryRoot,
        requestedPath: input.requestedPath,
        maximumBytes: input.maximumBytes,
      }),
    catch: (cause) => boundedReadRejected(`bounded read threw: ${(cause as Error).message}`, "READ"),
  })

  if (!result.success) {
    return yield* Effect.fail(boundedReadRejected(result.reason, result.stage))
  }
  return result.content
})

export * as BoundedFileRead from "./bounded-file-read"
