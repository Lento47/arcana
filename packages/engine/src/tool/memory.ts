import { Effect, Schema } from "effect"
import { openMemoryDB, MemoryStore } from "@arcana/memory"
import { memoryDataDir } from "@/memory/paths"
import * as Tool from "./tool"

const SearchParams = Schema.Struct({
  query: Schema.String.annotate({ description: "Search query over facts, sessions, and past messages" }),
  limit: Schema.optional(Schema.Number.annotate({ description: "Max results (default 5)" })),
})

const StoreParams = Schema.Struct({
  key: Schema.String.annotate({ description: "Unique key (e.g. 'user.preferred_language')" }),
  value: Schema.String.annotate({ description: "Value to store" }),
  source: Schema.optional(Schema.String.annotate({ description: "Where this fact came from" })),
})

function store(): MemoryStore {
  return new MemoryStore(openMemoryDB(memoryDataDir()))
}

export const MemorySearchTool = Tool.define("memory_search", Effect.succeed({
  description: "Search persistent memory (facts and past sessions). Memory is on by default.",
  parameters: SearchParams,
  execute: (params: Schema.Schema.Type<typeof SearchParams>) =>
    Effect.sync(() => {
      const results = store().search(params.query, Number(params.limit ?? 5))
      if (!results.length) {
        return { title: "memory search", output: "No memory results found.", metadata: {} }
      }
      return {
        title: "memory search",
        output: results.map((row) => `[${row.type}:${row.id.slice(0, 8)}] ${row.snippet}`).join("\n"),
        metadata: {},
      }
    }),
}))

export const MemoryStoreFactTool = Tool.define("memory_store_fact", Effect.succeed({
  description:
    "Store a persistent fact in long-term memory. Same key updates in place (never duplicates). Survives sessions.",
  parameters: StoreParams,
  execute: (params: Schema.Schema.Type<typeof StoreParams>) =>
    Effect.sync(() => {
      const result = store().recordUserFact(params.key, params.value, params.source)
      const verb = result.merged ? "Updated" : "Stored"
      return {
        title: "memory store",
        output: `${verb}: ${params.key} = ${params.value}`,
        metadata: { key: params.key, merged: result.merged },
      }
    }),
}))
