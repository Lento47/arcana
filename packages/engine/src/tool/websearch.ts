import { Effect, Schema } from "effect"
import { HttpClient } from "effect/unstable/http"
import * as Tool from "./tool"
import * as McpWebSearch from "./mcp-websearch"
import DESCRIPTION from "./websearch.txt"
import { checksum } from "@arcana/core/util/encode"
import { InstallationVersion, USER_AGENT } from "@arcana/core/installation/version"
import { RuntimeFlags } from "@/effect/runtime-flags"

export const Parameters = Schema.Struct({
  query: Schema.optional(Schema.String).annotate({
    description:
      "A single websearch query. Prefer one comprehensive query over several narrow ones. Provide query or queries.",
  }),
  queries: Schema.optional(Schema.Array(Schema.String)).annotate({
    description:
      "2-4 distinct search queries for genuinely different angles, executed in one call (max 4). Merged into one result. Use only when a single comprehensive query cannot cover the angles.",
  }),
  numResults: Schema.optional(Schema.Number).annotate({
    description: "Number of search results to return (default: 8)",
  }),
  livecrawl: Schema.optional(Schema.Literals(["fallback", "preferred"])).annotate({
    description:
      "Live crawl mode - 'fallback': use live crawling as backup if cached content unavailable, 'preferred': prioritize live crawling (default: 'fallback')",
  }),
  type: Schema.optional(Schema.Literals(["auto", "fast", "deep"])).annotate({
    description: "Search type - 'auto': balanced search (default), 'fast': quick results, 'deep': comprehensive search",
  }),
  contextMaxCharacters: Schema.optional(Schema.Number).annotate({
    description: "Maximum characters for context string optimized for LLMs (default: 10000)",
  }),
})

export const MAX_QUERIES = 4

/** Merge `query` + `queries`, trim, drop blanks and exact duplicates, cap at MAX_QUERIES. */
export function normalizeQueries(input: { query?: string; queries?: readonly string[] }): string[] {
  const list = [
    ...(input.query?.trim() ? [input.query.trim()] : []),
    ...(input.queries ?? []).map((query) => query.trim()).filter((query) => query.length > 0),
  ]
  return [...new Set(list)].slice(0, MAX_QUERIES)
}

const WebSearchProviderSchema = Schema.Literals(["exa", "parallel"])
export type WebSearchProvider = Schema.Schema.Type<typeof WebSearchProviderSchema>

export function selectWebSearchProvider(sessionID: string, flags = { exa: false, parallel: false }): WebSearchProvider {
  const override = process.env.ARCANA_WEBSEARCH_PROVIDER
  if (override === "exa" || override === "parallel") return override
  if (flags.parallel) return "parallel"
  if (flags.exa) return "exa"

  return Number.parseInt(checksum(sessionID) ?? "0", 36) % 2 === 0 ? "exa" : "parallel"
}

export function webSearchProviderLabel(provider: unknown) {
  if (provider === "parallel") return "Parallel Web Search"
  if (provider === "exa") return "Exa Web Search"
  return "Web Search"
}

export function webSearchModelName(extra: Tool.Context["extra"]) {
  const model = extra?.model
  if (!model || typeof model !== "object") return undefined
  const api = "api" in model && model.api && typeof model.api === "object" ? model.api : undefined
  const apiID = api && "id" in api && typeof api.id === "string" ? api.id : undefined
  const id = "id" in model && typeof model.id === "string" ? model.id : undefined
  return (apiID ?? id)?.slice(0, 100)
}

function parallelAuthHeaders() {
  const headers = { "User-Agent": USER_AGENT }
  if (!process.env.PARALLEL_API_KEY) return headers
  return { ...headers, Authorization: `Bearer ${process.env.PARALLEL_API_KEY}` }
}

function callProvider(
  http: HttpClient.HttpClient,
  provider: WebSearchProvider,
  params: Schema.Schema.Type<typeof Parameters>,
  queries: string[],
  ctx: Tool.Context,
) {
  if (provider === "parallel") {
    return McpWebSearch.call(
      http,
      McpWebSearch.PARALLEL_URL,
      "web_search",
      McpWebSearch.ParallelSearchArgs,
      {
        objective: queries.join("; "),
        search_queries: queries,
        session_id: ctx.sessionID,
        model_name: webSearchModelName(ctx.extra),
      },
      "25 seconds",
      parallelAuthHeaders(),
    )
  }

  const search = (query: string) =>
    McpWebSearch.call(
      http,
      McpWebSearch.EXA_URL,
      "web_search_exa",
      McpWebSearch.SearchArgs,
      {
        query,
        type: params.type || "auto",
        numResults: params.numResults || 8,
        livecrawl: params.livecrawl || "fallback",
        contextMaxCharacters: params.contextMaxCharacters,
      },
      "25 seconds",
    )

  if (queries.length === 1) return search(queries[0]!)
  return Effect.forEach(queries, search, { concurrency: MAX_QUERIES }).pipe(
    Effect.map((results) => results.filter((text): text is string => Boolean(text)).join("\n\n---\n\n") || undefined),
  )
}

export const WebSearchTool = Tool.define(
  "websearch",
  Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient
    const flags = yield* RuntimeFlags.Service

    return {
      get description() {
        return DESCRIPTION.replace("{{year}}", new Date().getFullYear().toString())
      },
      parameters: Parameters,
      execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
        Effect.gen(function* () {
          const queries = normalizeQueries(params)
          if (queries.length === 0) {
            throw new Error("websearch requires a non-empty query or queries")
          }
          const provider = selectWebSearchProvider(ctx.sessionID, {
            exa: flags.enableExa,
            parallel: flags.enableParallel,
          })
          const title = webSearchProviderLabel(provider)
          const label = queries.length === 1 ? `"${queries[0]}"` : `${queries.length} queries`
          yield* ctx.metadata({ title: `${title} ${label}`, metadata: { provider, queries: queries.length } })

          yield* ctx.ask({
            permission: "websearch",
            patterns: queries,
            always: ["*"],
            metadata: {
              query: queries[0],
              queries,
              numResults: params.numResults,
              livecrawl: params.livecrawl,
              type: params.type,
              contextMaxCharacters: params.contextMaxCharacters,
              provider,
            },
          })

          const result = yield* callProvider(http, provider, params, queries, ctx)

          return {
            output: result ?? "No search results found. Please try a different query.",
            title: `${title}: ${queries.join(" | ")}`,
            metadata: { provider },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
