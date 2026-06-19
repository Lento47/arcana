import { Effect, Schema } from "effect"
import { Global } from "@arcana/core/global"
import { FSUtil } from "@arcana/core/fs-util"
import path from "path"
import { pathToFileURL } from "url"

/**
 * Shape of a user-authored agent module. Each file under {@link AGENTS_DIR}
 * `export default`s one of these. Mirrors the fields {@link Agent.Info}
 * understands; permissions are plain permission names that are turned into an
 * allow-ruleset by the loader's caller.
 */
export const ExternalAgent = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  prompt: Schema.optional(Schema.String),
  permissions: Schema.optional(Schema.Array(Schema.String)),
  routing: Schema.optional(
    Schema.Struct({
      keywords: Schema.optional(Schema.Array(Schema.String)),
      patterns: Schema.optional(Schema.Array(Schema.String)),
      capabilities: Schema.optional(Schema.Array(Schema.String)),
      priority: Schema.optional(Schema.Number),
      confidence: Schema.optional(Schema.Number),
    }),
  ),
  model: Schema.optional(Schema.Struct({ modelID: Schema.String, providerID: Schema.String })),
  color: Schema.optional(Schema.String),
})
export type ExternalAgent = Schema.Schema.Type<typeof ExternalAgent>

/** Directory user agent modules live in: `<config>/agents`. */
export const AGENTS_DIR = path.join(Global.Path.config, "agents")

/**
 * Loads user-authored agent definition modules (`.ts`/`.js`, each `export
 * default` an object matching {@link ExternalAgent}) from {@link AGENTS_DIR}.
 * A missing directory or a malformed module is skipped — this never throws.
 *
 * Pure data loader: it does NOT import {@link Agent} at runtime (type-only),
 * so there is no import cycle. `Agent.layer` consumes the result and builds the
 * full `Agent.Info` records (permissions, defaults) in one place.
 */
export const loadExternalAgents = Effect.fn("AgentSDK.loadExternalAgents")(function* () {
  const fs = yield* FSUtil.Service
  const exists = yield* fs.existsSafe(AGENTS_DIR).pipe(Effect.catch(() => Effect.succeed(false)))
  if (!exists) return [] as ExternalAgent[]

  const entries = yield* fs.readDirectoryEntries(AGENTS_DIR).pipe(Effect.catch(() => Effect.succeed([])))
  const decode = Schema.decodeUnknownEffect(ExternalAgent)
  const result: ExternalAgent[] = []
  for (const entry of entries) {
    if (entry.type !== "file") continue
    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".js")) continue
    const mod = yield* Effect.promise(() =>
      import(pathToFileURL(path.join(AGENTS_DIR, entry.name)).href)
        .then((m) => m.default)
        .catch(() => undefined),
    )
    if (!mod) continue
    const decoded = yield* decode(mod).pipe(Effect.catch(() => Effect.succeed(undefined)))
    if (decoded) result.push(decoded)
  }
  return result
})
