import Ajv, { type ValidateFunction } from "ajv"

const ajv = new Ajv({ strict: false })
const validatorCache = new Map<string, ValidateFunction>()
const VALIDATOR_CACHE_MAX = 100

/**
 * Evict oldest entries when cache exceeds max size.
 * Simple FIFO eviction — validators are expensive to compile but cheap to re-derive.
 */
function evictIfNeeded() {
  if (validatorCache.size <= VALIDATOR_CACHE_MAX) return
  const keys = validatorCache.keys()
  for (let i = 0; i < validatorCache.size - VALIDATOR_CACHE_MAX; i++) {
    const next = keys.next()
    if (next.done) break
    validatorCache.delete(next.value)
  }
}

/**
 * Deterministic cache key for a JSON Schema object.
 * JSON.stringify alone is NOT deterministic (key ordering varies across
 * JS engines and runs). Sorting top-level keys ensures equivalent schemas
 * share a validator. Nested keys are not sorted — in practice LLM-generated
 * JSON Schemas have consistent internal ordering, making shallow sort sufficient.
 */
function cacheKey(schema: object): string {
  return JSON.stringify(schema, Object.keys(schema).sort())
}

/**
 * Validate step output against its output_schema.
 * Returns original output string if valid, or a prefixed error/warning.
 * Gracefully handles: missing schema, non-JSON output, invalid schema, validation failure.
 */
export function validateStepOutput(
  output: string,
  outputSchema: unknown | undefined,
  stepId: string,
): string {
  // No schema → passthrough
  if (!outputSchema || typeof outputSchema !== "object") return output

  // Schema present — output must be JSON
  let parsed: unknown
  try {
    parsed = JSON.parse(output)
  } catch {
    return (
      `[SCHEMA ERROR] Step "${stepId}" output is not valid JSON, ` +
      `but output_schema requires JSON.\n\nRaw output:\n${output}`
    )
  }

  // Get or compile validator (deterministic cache key)
  const key = cacheKey(outputSchema as Record<string, unknown>)
  let validate = validatorCache.get(key)
  if (!validate) {
    try {
      validate = ajv.compile(outputSchema as object)
    } catch (e) {
      // Invalid JSON Schema — warn, don't block
      return (
        `[SCHEMA WARNING] Step "${stepId}" has an invalid output_schema: ` +
        `${e instanceof Error ? e.message : String(e)}\n\nRaw output:\n${output}`
      )
    }
    evictIfNeeded()
    validatorCache.set(key, validate)
  }

  const valid = validate(parsed)
  if (valid) return output

  const errors = validate.errors
    ? ajv.errorsText(validate.errors, { dataVar: "output" })
    : "unknown validation error"
  return (
    `[SCHEMA ERROR] Step "${stepId}" output does not match schema:\n` +
    `${errors}\n\nRaw output:\n${output}`
  )
}
