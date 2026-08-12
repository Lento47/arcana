/**
 * Contract/runtime parity checks for the Arcana runtime contract surface.
 *
 * Pure, data-driven functions. The CLI entry point
 * (script/contract-parity.ts) gathers the mounted runtime surface from the
 * live HttpApi definition and the emitted governance events from the live
 * event definitions, then feeds them into these functions. Keeping the
 * comparison logic free of engine imports makes it unit-testable with
 * fixtures (see test/contracts/contract-parity.test.ts).
 *
 * Conformance surface: the operations mounted by the `runtime` HttpApiGroup
 * (tag "runtime" in the generated OpenAPI) against the operations declared in
 * contracts/approval-api.v1.yaml, plus the documented out-of-contract
 * transport endpoints (/event, /health) and the governance event catalog
 * (contracts/events.v1.json) against the emitted durable governance kinds.
 */

import { parse as parseYaml } from "yaml"

export type HttpMethod = "get" | "post" | "put" | "delete" | "patch"

export interface ContractOperation {
  readonly method: HttpMethod
  /** OpenAPI template form, e.g. /approvals/{approvalID}. */
  readonly path: string
  readonly operationId?: string
  readonly queryParams: readonly string[]
  readonly successStatuses: readonly string[]
  /** Non-2xx statuses excluding 401 (auth middleware is out of contract scope). */
  readonly errorStatuses: readonly string[]
  /** status -> resolved component names referenced by the response schema. */
  readonly errorComponents: Readonly<Record<string, readonly string[]>>
}

export interface EmittedEvent {
  readonly type: string
  readonly kind: "envelope" | "inner"
  /** Top-level data field names for envelope events (EventV2 schemas). */
  readonly payloadKeys?: readonly string[]
}

export interface EventCatalog {
  readonly types: Readonly<Map<string, { readonly payloadKeys: readonly string[] }>>
  readonly aggregation: readonly string[]
  readonly breakthrough: readonly string[]
}

export interface PathSurfaceReport {
  /** Contract operations missing from the mounted runtime group. */
  readonly declaredNotMounted: readonly string[]
  /** Mounted runtime-group operations missing from the contract. */
  readonly mountedNotDeclared: readonly string[]
}

export interface EventsReport {
  /** Emitted governance kinds absent from the catalog. */
  readonly undocumentedEmitted: readonly string[]
  /** Catalog kinds with no emitter in the runtime. */
  readonly phantomCatalog: readonly string[]
  /** Envelope events whose catalog payload keys differ from the emitted schema. */
  readonly payloadMismatches: readonly string[]
  /** Aggregation/breakthrough references absent from the catalog event list. */
  readonly catalogRefsUnknown: readonly string[]
}

export interface Finding {
  readonly severity: "error" | "info"
  readonly section: string
  readonly message: string
}

const BUILT_IN_ERROR_PREFIXES = ["effect_HttpApiError_", "EffectHttpApiError"]
const AUTH_STATUS = "401"

function isBuiltInErrorComponent(name: string): boolean {
  return BUILT_IN_ERROR_PREFIXES.some((prefix) => name.startsWith(prefix))
}

export function operationKey(method: HttpMethod, path: string): string {
  return `${method.toUpperCase()} ${path}`
}

/** Resolve component names referenced by an OpenAPI response schema. */
function componentNamesFromSchema(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") return []
  const s = schema as { $ref?: string; anyOf?: unknown[]; oneOf?: unknown[]; items?: unknown }
  const names: string[] = []
  const push = (item: unknown) => {
    if (!item || typeof item !== "object") return
    const ref = (item as { $ref?: string }).$ref
    if (typeof ref === "string" && ref.startsWith("#/components/schemas/")) {
      names.push(ref.slice("#/components/schemas/".length))
    }
  }
  push(schema)
  for (const item of s.anyOf ?? []) push(item)
  for (const item of s.oneOf ?? []) push(item)
  push(s.items)
  return [...new Set(names)]
}

/** Extract error statuses and their component names from an operation. */
function operationErrors(operation: {
  responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>
}): { errorStatuses: string[]; errorComponents: Record<string, string[]> } {
  const errorStatuses: string[] = []
  const errorComponents: Record<string, string[]> = {}
  for (const [status, response] of Object.entries(operation.responses ?? {})) {
    const code = Number(status)
    if (Number.isNaN(code) || (code >= 200 && code < 300) || status === AUTH_STATUS) continue
    errorStatuses.push(status)
    const schema = response?.content?.["application/json"]?.schema
    errorComponents[status] = componentNamesFromSchema(schema)
  }
  errorStatuses.sort()
  return { errorStatuses, errorComponents }
}

/**
 * Parse contracts/approval-api.v1.yaml into the declared operation surface.
 * Resolves response `$ref`s (#/components/responses/*) to their schemas.
 */
export function parseContractOperations(yamlText: string): ContractOperation[] {
  const document = parseYaml(yamlText) as {
    paths?: Record<string, Record<string, unknown>>
    components?: { responses?: Record<string, unknown>; schemas?: Record<string, unknown> }
  }
  if (!document || typeof document !== "object" || !document.paths) {
    throw new Error("contract YAML: expected an OpenAPI document with a paths map")
  }
  const responses = document.components?.responses ?? {}
  const operations: ContractOperation[] = []
  for (const [path, item] of Object.entries(document.paths)) {
    for (const method of ["get", "post", "put", "delete", "patch"] as const) {
      const operation = item?.[method] as
        | {
            operationId?: string
            parameters?: Array<{ in?: string; name?: string }>
            responses?: Record<string, unknown>
          }
        | undefined
      if (!operation) continue

      const queryParams = (operation.parameters ?? [])
        .filter((p) => p.in === "query")
        .map((p) => p.name ?? "")
        .filter(Boolean)
      const successStatuses: string[] = []
      const errorStatuses: string[] = []
      const errorComponents: Record<string, string[]> = {}
      for (const [status, rawResponse] of Object.entries(operation.responses ?? {})) {
        const code = Number(status)
        if (code >= 200 && code < 300) {
          successStatuses.push(status)
          continue
        }
        if (status === AUTH_STATUS) continue
        errorStatuses.push(status)
        // Resolve #/components/responses/* refs, then extract schema refs.
        const response =
          typeof rawResponse === "object" &&
          rawResponse !== null &&
          "$ref" in rawResponse &&
          typeof (rawResponse as { $ref: string }).$ref === "string"
            ? resolveResponseRef((rawResponse as { $ref: string }).$ref, responses)
            : rawResponse
        const responseRecord = response as { content?: Record<string, { schema?: unknown }> }
        const content = responseRecord?.content
        errorComponents[status] = componentNamesFromSchema(content?.["application/json"]?.schema)
      }
      successStatuses.sort()
      errorStatuses.sort()
      operations.push({
        method,
        path,
        operationId: operation.operationId,
        queryParams,
        successStatuses,
        errorStatuses,
        errorComponents,
      })
    }
  }
  return operations
}

function resolveResponseRef(ref: string, responses: Record<string, unknown>): unknown {
  if (!ref.startsWith("#/components/responses/")) return undefined
  const name = ref.slice("#/components/responses/".length)
  return responses[name]
}

/** Extract operations tagged `runtime` from the generated OpenAPI spec. */
export function mountedRuntimeOperations(openapi: unknown): ContractOperation[] {
  const spec = openapi as {
    paths?: Record<string, Record<string, unknown>>
  }
  const operations: ContractOperation[] = []
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const method of ["get", "post", "put", "delete", "patch"] as const) {
      const operation = item?.[method] as
        | {
            operationId?: string
            tags?: string[]
            parameters?: Array<{ in?: string; name?: string }>
            responses?: Record<string, { content?: Record<string, { schema?: unknown }> }>
          }
        | undefined
      if (!operation || !(operation.tags ?? []).includes("runtime")) continue
      const queryParams = (operation.parameters ?? [])
        .filter((p) => p.in === "query")
        .map((p) => p.name ?? "")
        .filter(Boolean)
      const { errorStatuses, errorComponents } = operationErrors(operation)
      const successStatuses = Object.keys(operation.responses ?? {})
        .filter((status) => {
          const code = Number(status)
          return !Number.isNaN(code) && code >= 200 && code < 300
        })
        .sort()
      operations.push({
        method,
        path,
        operationId: operation.operationId,
        queryParams,
        successStatuses,
        errorStatuses,
        errorComponents,
      })
    }
  }
  return operations
}

/** Bidirectional path/method parity between contract and mounted runtime group. */
export function compareSurfaces(declared: readonly ContractOperation[], mounted: readonly ContractOperation[]): PathSurfaceReport {
  const declaredKeys = new Set(declared.map((op) => operationKey(op.method, op.path)))
  const mountedKeys = new Set(mounted.map((op) => operationKey(op.method, op.path)))
  return {
    declaredNotMounted: [...declaredKeys].filter((key) => !mountedKeys.has(key)).sort(),
    mountedNotDeclared: [...mountedKeys].filter((key) => !declaredKeys.has(key)).sort(),
  }
}

/** Error status parity per operation (401 excluded on both sides). */
export function compareErrorStatuses(declared: readonly ContractOperation[], mounted: readonly ContractOperation[]): string[] {
  const mountedByKey = new Map(mounted.map((op) => [operationKey(op.method, op.path), op]))
  const violations: string[] = []
  for (const op of declared) {
    const mountedOp = mountedByKey.get(operationKey(op.method, op.path))
    if (!mountedOp) continue
    const declaredStatuses = op.errorStatuses.filter((s) => s !== AUTH_STATUS).sort()
    const mountedStatuses = mountedOp.errorStatuses.filter((s) => s !== AUTH_STATUS).sort()
    if (JSON.stringify(declaredStatuses) !== JSON.stringify(mountedStatuses)) {
      violations.push(
        `${operationKey(op.method, op.path)}: contract error statuses [${declaredStatuses.join(",")}] != mounted [${mountedStatuses.join(",")}]`,
      )
    }
  }
  return violations
}

/**
 * v2 error class usage, mirroring the enforcement in
 * test/server/httpapi-public-openapi.test.ts: error responses must reference
 * named v2 error components (errors.ts classes), never built-in Effect
 * components only. 400 must reference InvalidRequestError, 404 must
 * reference NotFoundError (the ApiNotFoundError wire shape).
 */
export function checkV2ErrorClasses(mounted: readonly ContractOperation[]): string[] {
  const violations: string[] = []
  for (const op of mounted) {
    for (const status of op.errorStatuses) {
      if (status === AUTH_STATUS) continue
      const names = op.errorComponents[status] ?? []
      const named = names.filter((name) => !isBuiltInErrorComponent(name))
      if (named.length === 0) {
        violations.push(
          `${operationKey(op.method, op.path)} ${status}: only built-in error components [${names.join(",")}], no v2 error class`,
        )
        continue
      }
      if (status === "400" && !names.includes("InvalidRequestError")) {
        violations.push(`${operationKey(op.method, op.path)} 400: missing InvalidRequestError in [${names.join(",")}]`)
      }
      if (status === "404" && !names.includes("NotFoundError")) {
        violations.push(`${operationKey(op.method, op.path)} 404: missing NotFoundError in [${names.join(",")}]`)
      }
    }
  }
  return violations
}

/** Every contract-declared error component must be referenced by the mounted op. */
export function compareContractErrorComponents(declared: readonly ContractOperation[], mounted: readonly ContractOperation[]): string[] {
  const mountedByKey = new Map(mounted.map((op) => [operationKey(op.method, op.path), op]))
  const violations: string[] = []
  for (const op of declared) {
    const mountedOp = mountedByKey.get(operationKey(op.method, op.path))
    if (!mountedOp) continue
    for (const status of op.errorStatuses) {
      const declaredNames = (op.errorComponents[status] ?? []).filter((name) => !isBuiltInErrorComponent(name))
      const mountedNames = mountedOp.errorComponents[status] ?? []
      for (const name of declaredNames) {
        if (!mountedNames.includes(name)) {
          violations.push(
            `${operationKey(op.method, op.path)} ${status}: contract declares ${name} but mounted references [${mountedNames.join(",")}]`,
          )
        }
      }
    }
  }
  return violations
}

/** Contract-declared query parameters must be accepted by the mounted op. */
export function compareQueryParams(declared: readonly ContractOperation[], mounted: readonly ContractOperation[]): string[] {
  const mountedByKey = new Map(mounted.map((op) => [operationKey(op.method, op.path), op]))
  const violations: string[] = []
  for (const op of declared) {
    const mountedOp = mountedByKey.get(operationKey(op.method, op.path))
    if (!mountedOp) continue
    for (const name of op.queryParams) {
      if (!mountedOp.queryParams.includes(name)) {
        violations.push(`${operationKey(op.method, op.path)}: contract query param ${name} not accepted by mounted op`)
      }
    }
  }
  return violations
}

/** Every declared operation must have a 2xx response mounted. */
export function compareSuccessStatuses(declared: readonly ContractOperation[], mounted: readonly ContractOperation[]): string[] {
  const mountedByKey = new Map(mounted.map((op) => [operationKey(op.method, op.path), op]))
  const violations: string[] = []
  for (const op of declared) {
    const mountedOp = mountedByKey.get(operationKey(op.method, op.path))
    if (!mountedOp) continue
    if (op.successStatuses.length > 0 && mountedOp.successStatuses.length === 0) {
      violations.push(`${operationKey(op.method, op.path)}: contract declares 2xx responses but mounted op has none`)
    }
  }
  return violations
}

/**
 * Documented out-of-contract transport endpoints. /event (SSE) and /health
 * are mounted runtime endpoints documented in docs/RUNTIME-API-CONTRACT.md;
 * /event's payloads are cataloged in contracts/events.v1.json. This check
 * keeps them honest without requiring them inside the OpenAPI operation set.
 */
export function checkOutOfContractTransport(
  openapi: unknown,
  serverSource: string,
  runtimeContractDoc: string,
): string[] {
  const violations: string[] = []
  const spec = openapi as { paths?: Record<string, Record<string, unknown>> }
  const eventOp = spec.paths?.["/event"]?.get
  if (!eventOp) violations.push("/event: GET SSE endpoint not mounted in the runtime OpenAPI")
  if (!/router\.add\(\s*"GET"\s*,\s*"\/health"/.test(serverSource)) {
    violations.push("/health: GET route not found in the runtime server source")
  }
  if (!/GET\s*\|\s*`\/event`/.test(runtimeContractDoc)) {
    violations.push("docs/RUNTIME-API-CONTRACT.md: mounted endpoint table missing GET /event")
  }
  if (!/GET\s*\|\s*`\/health`/.test(runtimeContractDoc)) {
    violations.push("docs/RUNTIME-API-CONTRACT.md: mounted endpoint table missing GET /health")
  }
  return violations
}

/** Parse contracts/events.v1.json into the cataloged event surface. */
export function parseEventCatalog(jsonText: string): EventCatalog {
  const document = JSON.parse(jsonText) as {
    properties?: {
      events?: { example?: Array<{ type?: string; payload?: Record<string, unknown> }> }
      aggregation?: {
        properties?: { groups?: { properties?: Record<string, { items?: { enum?: string[] } }> } }
      }
      securityBreakthrough?: { items?: { enum?: string[] } }
    }
  }
  const example = document.properties?.events?.example ?? []
  const types = new Map<string, { payloadKeys: string[] }>()
  for (const entry of example) {
    if (typeof entry.type !== "string" || entry.type.length === 0) continue
    types.set(entry.type, { payloadKeys: Object.keys(entry.payload ?? {}) })
  }
  const aggregation: string[] = []
  for (const group of Object.values(document.properties?.aggregation?.properties?.groups?.properties ?? {})) {
    aggregation.push(...(group?.items?.enum ?? []))
  }
  const breakthrough = document.properties?.securityBreakthrough?.items?.enum ?? []
  return { types, aggregation, breakthrough }
}

/** Compare emitted governance kinds against the catalog. */
export function compareEvents(emitted: readonly EmittedEvent[], catalog: EventCatalog): EventsReport {
  const emittedByType = new Map(emitted.map((event) => [event.type, event]))
  const catalogTypes = [...catalog.types.keys()]
  const undocumentedEmitted = [...emittedByType.keys()]
    .filter((type) => !catalog.types.has(type))
    .sort()
  const phantomCatalog = catalogTypes.filter((type) => !emittedByType.has(type)).sort()

  const payloadMismatches: string[] = []
  for (const event of emitted) {
    if (event.kind !== "envelope" || !event.payloadKeys) continue
    const catalogEntry = catalog.types.get(event.type)
    if (!catalogEntry) continue
    const emittedKeys = [...event.payloadKeys].sort()
    const catalogKeys = [...catalogEntry.payloadKeys].sort()
    if (JSON.stringify(emittedKeys) !== JSON.stringify(catalogKeys)) {
      payloadMismatches.push(
        `${event.type}: emitted payload fields [${emittedKeys.join(",")}] != catalog payload fields [${catalogKeys.join(",")}]`,
      )
    }
  }

  const catalogRefsUnknown = [...catalog.aggregation, ...catalog.breakthrough]
    .filter((type) => !catalog.types.has(type))
    .sort()

  return { undocumentedEmitted, phantomCatalog, payloadMismatches, catalogRefsUnknown }
}

/**
 * Extract the property names of a Schema.Struct (used for EventV2 envelope
 * data schemas). Accepts any object exposing `.ast` with propertySignatures
 * so tests can pass minimal fakes.
 */
export function structFieldNames(schema: unknown): string[] {
  const ast = (schema as { ast?: { propertySignatures?: Array<{ name?: string }> } } | undefined)?.ast
  return (ast?.propertySignatures ?? []).map((p) => p.name ?? "").filter(Boolean)
}

/**
 * Extract string literals from a Schema.Union (used for the ArcanaEvent type
 * union). Walks nested unions defensively.
 */
export function unionLiteralValues(schema: unknown): string[] {
  const ast = (schema as { ast?: unknown } | undefined)?.ast
  const literals: string[] = []
  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return
    const n = node as { _tag?: string; literal?: string; types?: unknown[]; members?: unknown[]; type?: unknown }
    if (n._tag === "Literal" && typeof n.literal === "string") {
      literals.push(n.literal)
      return
    }
    for (const list of [n.types, n.members]) {
      if (Array.isArray(list)) for (const member of list) walk(member)
    }
    if (n.type) walk(n.type)
  }
  walk(ast)
  return literals
}

/** Mounted paths outside the contract surface (informational report). */
export function outOfScopeMountedPaths(openapi: unknown, declared: readonly ContractOperation[]): string[] {
  const spec = openapi as { paths?: Record<string, Record<string, unknown>> }
  const declaredKeys = new Set(declared.map((op) => operationKey(op.method, op.path)))
  const out: string[] = []
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    if (path.startsWith("/api/") || path.startsWith("/session") || path.startsWith("/pty")) continue
    for (const method of ["get", "post", "put", "delete", "patch"] as const) {
      if (!item?.[method]) continue
      const key = operationKey(method, path)
      if (!declaredKeys.has(key) && key !== "GET /event") out.push(key)
    }
  }
  return out.sort()
}

/** Build the human-readable report and the exit code. */
export function summarize(findings: readonly Finding[]): { text: string; exitCode: 0 | 1 } {
  const errors = findings.filter((f) => f.severity === "error")
  const infos = findings.filter((f) => f.severity === "info")
  const lines: string[] = []
  lines.push("contract parity: contracts vs mounted runtime surface")
  for (const info of infos) lines.push(`  ℹ ${info.section}: ${info.message}`)
  for (const error of errors) lines.push(`  ✗ ${infoSection(error)}: ${error.message}`)
  lines.push(`contract parity: ${errors.length} error(s), ${infos.length} info(s)`)
  return { text: lines.join("\n"), exitCode: errors.length > 0 ? 1 : 0 }
}

function infoSection(finding: Finding): string {
  return finding.section
}
