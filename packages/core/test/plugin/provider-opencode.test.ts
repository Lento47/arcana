import { describe, expect } from "bun:test"
import { DateTime, Effect, Layer, Option } from "effect"
import { Catalog } from "@arcana/core/catalog"
import { Credential } from "@arcana/core/credential"
import { EventV2 } from "@arcana/core/event"
import { Integration } from "@arcana/core/integration"
import { Location } from "@arcana/core/location"
import { ModelV2 } from "@arcana/core/model"
import { PluginV2 } from "@arcana/core/plugin"
import { OpencodePlugin } from "@arcana/core/plugin/provider/opencode"
import { ProviderV2 } from "@arcana/core/provider"
import { AbsolutePath } from "@arcana/core/schema"
import { location } from "../fixture/location"
import { it, model, provider, withEnv } from "./provider-helper"

const cost = (input: number, output = 0) => [{ input, output, cache: { read: 0, write: 0 } }]
const locationLayer = Layer.succeed(
  Location.Service,
  Location.Service.of(location({ directory: AbsolutePath.make("test") })),
)

const pluginWithIntegrations = (integrations: Integration.Interface) => ({
  ...OpencodePlugin,
  effect: OpencodePlugin.effect.pipe(Effect.provideService(Integration.Service, integrations)),
})

describe("OpencodePlugin", () => {
  it.effect("uses a public key and disables paid models without credentials", () =>
    withEnv({ ARCANA_API_KEY: undefined }, () =>
      Effect.gen(function* () {
        const plugin = yield* PluginV2.Service
        const catalog = yield* Catalog.Service
        yield* plugin.add(pluginWithIntegrations(yield* Integration.Service))
        const transform = yield* catalog.transform()
        yield* transform((catalog) => {
          const item = provider("arcana")
          catalog.provider.update(item.id, () => {})
          const paid = model("arcana", "paid", { cost: cost(1) })
          catalog.model.update(item.id, paid.id, (draft) => {
            draft.cost = [...paid.cost]
          })
        })
        expect((yield* catalog.provider.get(ProviderV2.ID.opencode)).request.body.apiKey).toBe("public")
        expect((yield* catalog.model.get(ProviderV2.ID.opencode, ModelV2.ID.make("paid"))).enabled).toBe(false)
      }),
    ),
  )

  it.effect("keeps free models without credentials", () =>
    withEnv({ ARCANA_API_KEY: undefined }, () =>
      Effect.gen(function* () {
        const plugin = yield* PluginV2.Service
        const catalog = yield* Catalog.Service
        yield* plugin.add(pluginWithIntegrations(yield* Integration.Service))
        const transform = yield* catalog.transform()
        yield* transform((catalog) => {
          const item = provider("arcana")
          catalog.provider.update(item.id, () => {})
          const free = model("arcana", "free", { cost: cost(0) })
          catalog.model.update(item.id, free.id, (draft) => {
            draft.cost = [...free.cost]
          })
        })
        expect((yield* catalog.provider.get(ProviderV2.ID.opencode)).request.body.apiKey).toBe("public")
        expect((yield* catalog.model.get(ProviderV2.ID.opencode, ModelV2.ID.make("free"))).enabled).toBe(true)
      }),
    ),
  )

  it.effect("treats output-only cost as free without credentials", () =>
    withEnv({ ARCANA_API_KEY: undefined }, () =>
      Effect.gen(function* () {
        const plugin = yield* PluginV2.Service
        const catalog = yield* Catalog.Service
        yield* plugin.add(pluginWithIntegrations(yield* Integration.Service))
        const transform = yield* catalog.transform()
        yield* transform((catalog) => {
          const item = provider("arcana")
          catalog.provider.update(item.id, () => {})
          const outputOnly = model("arcana", "output-only", { cost: cost(0, 1) })
          catalog.model.update(item.id, outputOnly.id, (draft) => {
            draft.cost = [...outputOnly.cost]
          })
        })
        expect((yield* catalog.provider.get(ProviderV2.ID.opencode)).request.body.apiKey).toBe("public")
        expect((yield* catalog.model.get(ProviderV2.ID.opencode, ModelV2.ID.make("output-only"))).enabled).toBe(true)
      }),
    ),
  )

  it.effect("uses ARCANA_API_KEY as credentials", () =>
    withEnv({ ARCANA_API_KEY: "secret" }, () =>
      Effect.gen(function* () {
        const plugin = yield* PluginV2.Service
        const catalog = yield* Catalog.Service
        yield* plugin.add(pluginWithIntegrations(yield* Integration.Service))
        const transform = yield* catalog.transform()
        yield* transform((catalog) => {
          const item = provider("arcana")
          catalog.provider.update(item.id, () => {})
          const paid = model("arcana", "paid", { cost: cost(1) })
          catalog.model.update(item.id, paid.id, (draft) => {
            draft.cost = [...paid.cost]
          })
        })
        expect((yield* catalog.provider.get(ProviderV2.ID.opencode)).request.body.apiKey).toBeUndefined()
        expect((yield* catalog.model.get(ProviderV2.ID.opencode, ModelV2.ID.make("paid"))).enabled).toBe(true)
      }),
    ),
  )

  it.effect("uses configured provider env vars as credentials", () =>
    withEnv({ ARCANA_API_KEY: undefined, CUSTOM_ARCANA_API_KEY: "secret" }, () =>
      Effect.gen(function* () {
        const plugin = yield* PluginV2.Service
        const catalog = yield* Catalog.Service
        const integrations = yield* Integration.Service
        yield* plugin.add(pluginWithIntegrations(integrations))
        yield* integrations.update((editor) => {
          editor.method.update({
            integrationID: Integration.ID.make("arcana"),
            method: { type: "env", names: ["CUSTOM_ARCANA_API_KEY"] },
          })
        })
        const transform = yield* catalog.transform()
        yield* transform((catalog) => {
          const item = provider("arcana")
          catalog.provider.update(item.id, () => {})
          const paid = model("arcana", "paid", { cost: cost(1) })
          catalog.model.update(item.id, paid.id, (draft) => {
            draft.cost = [...paid.cost]
          })
        })
        expect((yield* catalog.provider.get(ProviderV2.ID.opencode)).request.body.apiKey).toBeUndefined()
        expect((yield* catalog.model.get(ProviderV2.ID.opencode, ModelV2.ID.make("paid"))).enabled).toBe(true)
      }),
    ),
  )

  it.effect("uses configured apiKey as credentials", () =>
    withEnv({ ARCANA_API_KEY: undefined }, () =>
      Effect.gen(function* () {
        const plugin = yield* PluginV2.Service
        const catalog = yield* Catalog.Service
        yield* plugin.add(pluginWithIntegrations(yield* Integration.Service))
        const transform = yield* catalog.transform()
        yield* transform((catalog) => {
          const item = provider("arcana", {
            request: {
              headers: {},
              body: { apiKey: "configured" },
            },
          })
          catalog.provider.update(item.id, (draft) => {
            draft.request = item.request
          })
          const paid = model("arcana", "paid", { cost: cost(1) })
          catalog.model.update(item.id, paid.id, (draft) => {
            draft.cost = [...paid.cost]
          })
        })
        expect((yield* catalog.provider.get(ProviderV2.ID.opencode)).request.body.apiKey).toBe("configured")
        expect((yield* catalog.model.get(ProviderV2.ID.opencode, ModelV2.ID.make("paid"))).enabled).toBe(true)
      }),
    ),
  )

  it.effect("ignores non-opencode providers and models", () =>
    withEnv({ ARCANA_API_KEY: undefined }, () =>
      Effect.gen(function* () {
        const plugin = yield* PluginV2.Service
        const catalog = yield* Catalog.Service
        yield* plugin.add(pluginWithIntegrations(yield* Integration.Service))
        const transform = yield* catalog.transform()
        yield* transform((catalog) => {
          const item = provider("openai")
          catalog.provider.update(item.id, () => {})
          const paid = model("openai", "paid", { cost: cost(1) })
          catalog.model.update(item.id, paid.id, (draft) => {
            draft.cost = [...paid.cost]
          })
        })
        expect((yield* catalog.provider.get(ProviderV2.ID.openai)).request.body.apiKey).toBeUndefined()
        expect((yield* catalog.model.get(ProviderV2.ID.openai, ModelV2.ID.make("paid"))).enabled).toBe(true)
      }),
    ),
  )

  it.effect("prefers gpt-5-nano as the opencode small model", () =>
    Effect.gen(function* () {
      const catalog = yield* Catalog.Service
      const providerID = ProviderV2.ID.opencode

      const transform = yield* catalog.transform()
      yield* transform((catalog) => {
        catalog.provider.update(providerID, () => {})
        catalog.model.update(providerID, ModelV2.ID.make("cheap-mini"), (model) => {
          model.capabilities.input = ["text"]
          model.capabilities.output = ["text"]
          model.cost = [...cost(1, 1)]
          model.time.released = DateTime.makeUnsafe(Date.now())
        })
        catalog.model.update(providerID, ModelV2.ID.make("gpt-5-nano"), (model) => {
          model.capabilities.input = ["text"]
          model.capabilities.output = ["text"]
          model.cost = [...cost(10, 10)]
          model.time.released = DateTime.makeUnsafe(Date.now())
        })
      })

      const selected = yield* catalog.model.small(providerID)

      expect(Option.getOrUndefined(selected)?.id).toBe(ModelV2.ID.make("gpt-5-nano"))
    }).pipe(
      Effect.provide(Catalog.locationLayer.pipe(Layer.provide(EventV2.defaultLayer), Layer.provide(locationLayer))),
    ),
  )
})
