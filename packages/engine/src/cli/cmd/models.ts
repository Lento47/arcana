import { EOL } from "os"
import { Effect } from "effect"
import { ModelsDev } from "@arcana/core/models-dev"
import { effectCmd, fail } from "../effect-cmd"
import { UI } from "../ui"
import { ProviderV2 } from "@arcana/core/provider"
import { outputJson, isJsonMode, jsonOption } from "../json-output"

const SECRET_KEY_PATTERN = /api[-_]?key|secret|token|password|authorization|bearer/i

/**
 * Recursively redact credential-shaped fields before serializing model
 * metadata to --json output (contract rule: no secrets in JSON).
 */
function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets)
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {}
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) {
        out[key] = "[redacted]"
      } else {
        out[key] = redactSecrets(child)
      }
    }
    return out
  }
  return value
}

export const ModelsCommand = effectCmd({
  command: "models [provider]",
  describe: "list all available models",
  builder: (yargs) =>
    yargs
      .positional("provider", {
        describe: "provider ID to filter models by",
        type: "string",
        array: false,
      })
      .option("verbose", {
        describe: "use more verbose model output (includes metadata like costs)",
        type: "boolean",
      })
      .option("refresh", {
        describe: "refresh the models cache from models.dev",
        type: "boolean",
      })
      .option("json", {
        describe: "output machine-readable JSON to stdout",
        type: "boolean",
        default: false,
      }),
  handler: Effect.fn("Cli.models")(function* (args) {
    const { Provider } = yield* Effect.promise(() => import("@/provider/provider"))
    if (args.refresh) {
      yield* ModelsDev.Service.use((s) => s.refresh(true))
      UI.println(UI.Style.TEXT_SUCCESS_BOLD + "Models cache refreshed" + UI.Style.TEXT_NORMAL)
    }

    const provider = yield* Provider.Service
    const providers = yield* provider.list()

    const jsonFor = (providerID: ProviderV2.ID, verbose?: boolean) => {
      const p = providers[providerID]
      const sorted = Object.entries(p.models).sort(([a], [b]) => a.localeCompare(b))
      return sorted.map(([modelID, model]) => ({
        id: modelID,
        ...(verbose ? (redactSecrets(model) as object) : { name: model.name }),
      }))
    }

    const print = (providerID: ProviderV2.ID, verbose?: boolean) => {
      const p = providers[providerID]
      const sorted = Object.entries(p.models).sort(([a], [b]) => a.localeCompare(b))
      for (const [modelID, model] of sorted) {
        process.stdout.write(`${providerID}/${modelID}`)
        process.stdout.write(EOL)
        if (verbose) {
          process.stdout.write(JSON.stringify(model, null, 2))
          process.stdout.write(EOL)
        }
      }
    }

    if (args.provider) {
      const providerID = ProviderV2.ID.make(args.provider)
      if (!providers[providerID]) return yield* fail(`Provider not found: ${args.provider}`)
      if (isJsonMode(args)) {
        outputJson({ [args.provider]: jsonFor(providerID, args.verbose) })
        return
      }
      print(providerID, args.verbose)
      return
    }

    const ids = Object.keys(providers).sort((a, b) => {
      const aIsOpencode = a.startsWith("arcana")
      const bIsOpencode = b.startsWith("arcana")
      if (aIsOpencode && !bIsOpencode) return -1
      if (!aIsOpencode && bIsOpencode) return 1
      return a.localeCompare(b)
    })

    if (isJsonMode(args)) {
      const out: Record<string, unknown> = {}
      for (const providerID of ids) out[providerID] = jsonFor(ProviderV2.ID.make(providerID), args.verbose)
      outputJson(out)
      return
    }

    for (const providerID of ids) print(ProviderV2.ID.make(providerID), args.verbose)
  }),
})
