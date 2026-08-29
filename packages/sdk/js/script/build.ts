#!/usr/bin/env bun
import { fileURLToPath } from "url"

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)

import { $ } from "bun"
import path from "path"

import { createClient } from "@hey-api/openapi-ts"

const engine = path.resolve(dir, "../../engine")

await $`bun dev generate > ${dir}/openapi.json`.cwd(engine)

await createClient({
  input: "./openapi.json",
  output: {
    path: "./src/v2/gen",
    tsConfigPath: path.join(dir, "tsconfig.json"),
    clean: true,
  },
  plugins: [
    {
      name: "@hey-api/typescript",
      exportFromIndex: false,
    },
    {
      name: "@hey-api/sdk",
      instance: "OpencodeClient",
      exportFromIndex: false,
      auth: false,
      paramsStructure: "flat",
    },
    {
      name: "@hey-api/client-fetch",
      exportFromIndex: false,
      baseUrl: "http://localhost:4096",
    },
  ],
})

// Keep the generated endpoint surface while replacing the generated parser
// with Arcana's incremental implementation. The stock parser repeatedly
// copies/splits its partial buffer, which is quadratic for large frames split
// into tiny chunks (common for streamed tool output).
const sseParserPath = "./src/v2/gen/core/serverSentEvents.gen.ts"
const sseParserFile = Bun.file(sseParserPath)
const sseParserSource = await sseParserFile.text()
const sseParserImport = 'import { createIncrementalSseClient } from "../../sse-parser.js"'
const sseParserImported = sseParserSource.includes(sseParserImport)
  ? sseParserSource
  : sseParserSource.replace(
      /import type \{ Config \} from ['"]\.\/types\.gen['"];?\r?\n/,
      (match) => `${match}${sseParserImport}\n`,
    )
if (!sseParserImported.includes(sseParserImport)) {
  throw new Error(`Incremental SSE parser import patch did not apply (${sseParserPath})`)
}
const sseParserPatched = sseParserImported.replace(
  /export const createSseClient =[\s\S]*$/,
  `export const createSseClient = <TData = unknown>(\n  options: ServerSentEventsOptions<TData>,\n): ServerSentEventsResult<TData> => createIncrementalSseClient(options)\n`,
)
if (sseParserPatched === sseParserSource) {
  throw new Error(`Incremental SSE parser patch did not apply (${sseParserPath})`)
}
await Bun.write(sseParserPath, sseParserPatched)

// Adding the optional directory/workspace query changed hey-api's generated
// method to `(parameters, options)`. Preserve the pre-query `(options)` form
// as well: older ACP/SDK consumers commonly pass an AbortSignal there, and a
// silent signature break would drop cancellation while leaving the stream
// apparently connected.
const sdkPath = "./src/v2/gen/sdk.gen.ts"
const sdkSource = await Bun.file(sdkPath).text()
const globalEventSignature =
  /\s+public event<ThrowOnError extends boolean = false>\(\s*parameters\?: \{[\s\S]*?\},\s*options\?: Options<never, ThrowOnError>\) \{/m
const globalEventMatch = globalEventSignature.exec(sdkSource)
const globalEventStart =
  globalEventMatch === null ? -1 : globalEventMatch.index + globalEventMatch[0].indexOf("public event")
const globalEventEndMatch =
  globalEventStart === -1 ? undefined : /\n\s*\/\*\*\s*\n\s*\* Dispose instance/.exec(sdkSource.slice(globalEventStart))
const globalEventEnd = globalEventEndMatch ? globalEventStart + globalEventEndMatch.index : -1
if (globalEventStart === -1 || globalEventEnd === -1) {
  throw new Error(`Global event compatibility patch did not find the generated method (${sdkPath})`)
}
const globalEventMethod = `  public event<ThrowOnError extends boolean = false>(
    parametersOrOptions?:
      | {
          directory?: string
          workspace?: string
        }
      | Options<never, ThrowOnError>,
    options?: Options<never, ThrowOnError>,
  ) {
    const hasParameters =
      parametersOrOptions !== undefined &&
      ("directory" in parametersOrOptions || "workspace" in parametersOrOptions)
    const parameters = hasParameters
      ? (parametersOrOptions as { directory?: string; workspace?: string })
      : undefined
    const requestOptions = (options ?? (hasParameters ? undefined : parametersOrOptions)) as
      | Options<never, ThrowOnError>
      | undefined
    const params = buildClientParams(
      [parameters],
      [
        {
          args: [
            { in: "query", key: "directory" },
            { in: "query", key: "workspace" },
          ],
        },
      ],
    )
    return (requestOptions?.client ?? this.client).sse.get<GlobalEventResponses, GlobalEventErrors, ThrowOnError>({
      url: "/global/event",
      ...requestOptions,
      ...params,
    })
  }`
const sdkPatched = sdkSource.slice(0, globalEventStart) + globalEventMethod + sdkSource.slice(globalEventEnd)
await Bun.write(sdkPath, sdkPatched)

// Patch a @hey-api/openapi-ts codegen bug: SseFn incorrectly passes the
// endpoint's TError into the second generic of ServerSentEventsResult, which
// is the AsyncGenerator's TReturn slot. Iterator return values have nothing
// to do with HTTP errors, and any consumer that calls `.return()` or returns
// from a mock generator gets type-checked against the wrong shape. Drop the
// arg so TReturn defaults to void.
const sseTypesPath = "./src/v2/gen/client/types.gen.ts"
const sseTypesFile = Bun.file(sseTypesPath)
const sseTypesSource = await sseTypesFile.text()
const sseTypesPatched = sseTypesSource.replace(
  "=> Promise<ServerSentEventsResult<TData, TError>>",
  "=> Promise<ServerSentEventsResult<TData>>",
)
if (sseTypesPatched === sseTypesSource) {
  throw new Error(`SseFn patch did not apply; @hey-api/openapi-ts output may have changed (${sseTypesPath})`)
}
await Bun.write(sseTypesPath, sseTypesPatched)

await $`bun prettier --write src/gen`
await $`bun prettier --write src/v2`
await $`rm -rf dist`
await $`bun tsc`
await $`rm openapi.json`
