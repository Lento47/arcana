/**
 * Unit tests for the contract parity comparison functions
 * (src/server/contract/parity.ts). Pure fixtures only: a minimal contract
 * YAML, synthetic mounted OpenAPI operations, a synthetic event catalog and
 * emitted event list. No live server.
 */
import { describe, expect, test } from "bun:test"
import {
  checkOutOfContractTransport,
  checkV2ErrorClasses,
  compareContractErrorComponents,
  compareErrorStatuses,
  compareEvents,
  compareQueryParams,
  compareSuccessStatuses,
  compareSurfaces,
  mountedRuntimeOperations,
  parseContractOperations,
  parseEventCatalog,
  structFieldNames,
  summarize,
  unionLiteralValues,
  type ContractOperation,
  type EmittedEvent,
} from "../../src/server/contract/parity"

const MINIMAL_CONTRACT_YAML = `
openapi: 3.0.3
info:
  title: Test contract
  version: 1.0.0
paths:
  /approvals:
    get:
      operationId: listApprovals
      parameters:
        - name: workspace
          in: query
          required: false
          schema:
            type: string
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: "#/components/schemas/ApprovalRecord"
        "400":
          $ref: "#/components/responses/BadRequest"
        "401":
          description: auth middleware, out of contract scope
  /approvals/{approvalID}:
    get:
      operationId: getApproval
      parameters:
        - name: approvalID
          in: path
          required: true
          schema:
            type: string
        - name: workspace
          in: query
          required: false
          schema:
            type: string
      responses:
        "200":
          description: ok
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/ApprovalRecord"
        "400":
          $ref: "#/components/responses/BadRequest"
        "404":
          $ref: "#/components/responses/NotFound"
  /approvals/{approvalID}/approve:
    post:
      operationId: approveRequest
      responses:
        "200":
          description: ok
        "400":
          $ref: "#/components/responses/BadRequest"
components:
  responses:
    BadRequest:
      description: malformed request
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/InvalidRequestError"
    NotFound:
      description: record not found
      content:
        application/json:
          schema:
            $ref: "#/components/schemas/NotFoundError"
  schemas:
    ApprovalRecord:
      type: object
      properties:
        approvalId:
          type: string
    InvalidRequestError:
      type: object
      required: [message]
      properties:
        message:
          type: string
    NotFoundError:
      type: object
      required: [name, data]
      properties:
        name:
          type: string
        data:
          type: object
`

/** Synthetic mounted runtime-group OpenAPI with the declared 3 ops plus an extra. */
function syntheticOpenApi(): unknown {
  return {
    paths: {
      "/approvals": {
        get: {
          operationId: "listApprovals",
          tags: ["runtime"],
          parameters: [{ name: "workspace", in: "query" }],
          responses: {
            "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/ApprovalRecord1" } } } },
            "400": { content: { "application/json": { schema: { $ref: "#/components/schemas/InvalidRequestError" } } } },
            "401": { content: { "application/json": { schema: {} } } },
          },
        },
      },
      "/approvals/{approvalID}": {
        get: {
          operationId: "getApproval",
          tags: ["runtime"],
          parameters: [{ name: "approvalID", in: "path" }, { name: "workspace", in: "query" }],
          responses: {
            "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/ApprovalRecord1" } } } },
            "400": { content: { "application/json": { schema: { $ref: "#/components/schemas/InvalidRequestError" } } } },
            "404": { content: { "application/json": { schema: { $ref: "#/components/schemas/NotFoundError" } } } },
            "401": { content: { "application/json": { schema: {} } } },
          },
        },
      },
      "/approvals/{approvalID}/approve": {
        post: {
          operationId: "approveRequest",
          tags: ["runtime"],
          responses: {
            "200": { content: { "application/json": { schema: {} } } },
            "400": { content: { "application/json": { schema: { $ref: "#/components/schemas/InvalidRequestError" } } } },
            "401": { content: { "application/json": { schema: {} } } },
          },
        },
      },
      // mounted but never declared in the contract fixture
      "/extra": {
        delete: {
          operationId: "deleteExtra",
          tags: ["runtime"],
          responses: {
            "200": { content: { "application/json": { schema: {} } } },
            "401": { content: { "application/json": { schema: {} } } },
          },
        },
      },
    },
  }
}

const MINIMAL_CATALOG = JSON.stringify({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  required: ["events", "aggregation", "securityBreakthrough"],
  properties: {
    events: {
      type: "array",
      items: { type: "object" },
      example: [
        { type: "approval.updated", summary: "approved", payload: { approvalId: "uuid", status: "APPROVED" } },
        { type: "governance.recorded", summary: "durable", payload: { recordId: "string", sequence: 1 } },
        { type: "authorization.requested", summary: "requested", payload: { requestId: "uuid" } },
      ],
    },
    aggregation: {
      type: "object",
      properties: {
        groups: {
          type: "object",
          properties: {
            decision: { type: "array", items: { type: "string", enum: ["approval.updated"] } },
          },
        },
      },
    },
    securityBreakthrough: {
      type: "array",
      items: { type: "string", enum: ["approval.updated", "capability.revoked"] },
    },
  },
})

const op = (method: string, path: string, overrides: Partial<ContractOperation> = {}): ContractOperation => ({
  method: method as ContractOperation["method"],
  path,
  queryParams: [],
  successStatuses: ["200"],
  errorStatuses: [],
  errorComponents: {},
  ...overrides,
})

describe("parseContractOperations", () => {
  test("parses template params, query params, and 2xx/error statuses from a minimal YAML", () => {
    const operations = parseContractOperations(MINIMAL_CONTRACT_YAML)
    expect(operations).toHaveLength(3)

    const list = operations.find((o) => o.operationId === "listApprovals")!
    expect(list.method).toBe("get")
    expect(list.path).toBe("/approvals")
    expect(list.queryParams).toEqual(["workspace"])
    expect(list.successStatuses).toEqual(["200"])
    expect(list.errorStatuses).toEqual(["400"]) // 401 excluded
    expect(list.errorComponents["400"]).toEqual(["InvalidRequestError"])

    const get = operations.find((o) => o.operationId === "getApproval")!
    expect(get.path).toBe("/approvals/{approvalID}")
    expect(get.errorStatuses).toEqual(["400", "404"])
    expect(get.errorComponents["400"]).toEqual(["InvalidRequestError"])
    expect(get.errorComponents["404"]).toEqual(["NotFoundError"])

    const approve = operations.find((o) => o.operationId === "approveRequest")!
    expect(approve.method).toBe("post")
    expect(approve.errorStatuses).toEqual(["400"])
  })

  test("rejects a document without a paths map", () => {
    expect(() => parseContractOperations("openapi: 3.0.3\ninfo: {title: t}\n")).toThrow(/paths map/)
  })
})

describe("mountedRuntimeOperations", () => {
  test("extracts only operations tagged runtime and skips 2xx in error statuses", () => {
    const operations = mountedRuntimeOperations(syntheticOpenApi())
    expect(operations).toHaveLength(4)
    for (const operation of operations) {
      expect(operation.errorStatuses.includes("200"), operation.operationId).toBe(false)
      expect(operation.errorStatuses.includes("401")).toBe(false)
    }
    const list = operations.find((o) => o.operationId === "listApprovals")!
    expect(list.errorStatuses).toEqual(["400"])
    expect(list.errorComponents["400"]).toEqual(["InvalidRequestError"])
  })
})

describe("compareSurfaces", () => {
  test("declared-but-not-mounted and mounted-but-undocumented are both reported", () => {
    const declared = parseContractOperations(MINIMAL_CONTRACT_YAML)
    const mounted = mountedRuntimeOperations(syntheticOpenApi())
    const report = compareSurfaces(declared, mounted)
    // The contract declares three ops; the mounted surface has an extra DELETE /extra.
    expect(report.declaredNotMounted).toEqual([])
    expect(report.mountedNotDeclared).toEqual(["DELETE /extra"])
  })

  test("a declared op missing from the mounted surface is reported", () => {
    const declared = parseContractOperations(MINIMAL_CONTRACT_YAML)
    const mounted = mountedRuntimeOperations(syntheticOpenApi()).filter((o) => o.operationId !== "approveRequest")
    const report = compareSurfaces(declared, mounted)
    expect(report.declaredNotMounted).toEqual(["POST /approvals/{approvalID}/approve"])
  })
})

describe("compareErrorStatuses", () => {
  test("reports status mismatches for ops mounted on both sides", () => {
    const declared = parseContractOperations(MINIMAL_CONTRACT_YAML)
    const mounted = mountedRuntimeOperations(syntheticOpenApi())
    expect(compareErrorStatuses(declared, mounted)).toEqual([])

    const regressed = mounted.map((o) =>
      o.operationId === "getApproval"
        ? { ...o, errorStatuses: o.errorStatuses.filter((s) => s !== "404") }
        : o,
    )
    const violations = compareErrorStatuses(declared, regressed)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("GET /approvals/{approvalID}")
    expect(violations[0]).toContain("404")
  })
})

describe("checkV2ErrorClasses", () => {
  test("rejects legacy generic error components on 400 and 404", () => {
    const legacy400 = op("get", "/legacy", {
      errorStatuses: ["400"],
      errorComponents: { "400": ["effect_HttpApiError_BadRequest"] },
    })
    const legacy404 = op("get", "/legacy404", {
      errorStatuses: ["404"],
      errorComponents: { "404": ["EffectHttpApiError_NotFound"] },
    })
    const violations = checkV2ErrorClasses([legacy400, legacy404])
    expect(violations).toHaveLength(2)
    expect(violations[0]).toContain("only built-in error components")
    expect(violations[1]).toContain("only built-in error components")
  })

  test("rejects 400/404 that miss the required v2 class even when named errors exist", () => {
    const wrong400 = op("get", "/wrong400", {
      errorStatuses: ["400"],
      errorComponents: { "400": ["effect_HttpApiError_BadRequest", "UpstreamError"] },
    })
    const wrong404 = op("get", "/wrong404", {
      errorStatuses: ["404"],
      errorComponents: { "404": ["ProviderNotFoundError"] },
    })
    const violations = checkV2ErrorClasses([wrong400, wrong404])
    expect(violations).toHaveLength(2)
    expect(violations[0]).toContain("missing InvalidRequestError")
    expect(violations[1]).toContain("missing NotFoundError")
  })

  test("accepts v2 group-scoped classes (InvalidRequestError, NotFoundError)", () => {
    const clean400 = op("get", "/ok400", {
      errorStatuses: ["400"],
      errorComponents: { "400": ["effect_HttpApiError_BadRequest", "InvalidRequestError"] },
    })
    const clean404 = op("get", "/ok404", {
      errorStatuses: ["404"],
      errorComponents: { "404": ["NotFoundError"] },
    })
    const clean503 = op("get", "/ok503", {
      errorStatuses: ["503"],
      errorComponents: { "503": ["ServiceUnavailableError"] },
    })
    expect(checkV2ErrorClasses([clean400, clean404, clean503])).toEqual([])
  })
})

describe("compareContractErrorComponents", () => {
  test("reports a contract-declared component the mounted op does not reference", () => {
    const declared = parseContractOperations(MINIMAL_CONTRACT_YAML)
    const mounted = mountedRuntimeOperations(syntheticOpenApi())
    expect(compareContractErrorComponents(declared, mounted)).toEqual([])

    const regressed = mounted.map((o) =>
      o.operationId === "getApproval"
        ? { ...o, errorComponents: { ...o.errorComponents, "404": ["effect_HttpApiError_NotFound"] } }
        : o,
    )
    const violations = compareContractErrorComponents(declared, regressed)
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain("contract declares NotFoundError")
  })
})

describe("compareQueryParams", () => {
  test("reports a declared query param the mounted op does not accept", () => {
    const declared = parseContractOperations(MINIMAL_CONTRACT_YAML)
    const mounted = mountedRuntimeOperations(syntheticOpenApi()).map((o) => ({
      ...o,
      queryParams: o.queryParams.filter((p) => p !== "workspace"),
    }))
    const violations = compareQueryParams(declared, mounted)
    expect(violations.length).toBeGreaterThanOrEqual(2)
    expect(violations[0]).toContain("contract query param workspace not accepted")
  })
})

describe("compareSuccessStatuses", () => {
  test("reports a declared 2xx response missing from the mounted op", () => {
    const declared = parseContractOperations(MINIMAL_CONTRACT_YAML)
    const mounted = mountedRuntimeOperations(syntheticOpenApi()).map((o) => ({
      ...o,
      successStatuses: o.operationId === "approveRequest" ? [] : o.successStatuses,
    }))
    const violations = compareSuccessStatuses(declared, mounted)
    expect(violations).toEqual(["POST /approvals/{approvalID}/approve: contract declares 2xx responses but mounted op has none"])
  })
})

describe("checkOutOfContractTransport", () => {
  const serverSource = `const healthRoute = HttpRouter.use((router) =>
  router.add("GET", "/health", () => HttpServerResponse.json({ status: "ok" }))
)`
  const doc = `
| Method | Path | Purpose |
|---|---|---|
| GET | \`/event\` | SSE event stream |
| GET | \`/health\` | Runtime health |
`

  test("passes when /event, /health and the doc table agree", () => {
    const openapi = { paths: { "/event": { get: { tags: ["event"] } } } }
    expect(checkOutOfContractTransport(openapi, serverSource, doc)).toEqual([])
  })

  test("flags a missing /event mount and a doc table missing /health", () => {
    const openapi = { paths: {} }
    const violations = checkOutOfContractTransport(openapi, serverSource, "| GET | `/event` | SSE |\n")
    expect(violations).toContain("/event: GET SSE endpoint not mounted in the runtime OpenAPI")
    expect(violations.some((v) => v.includes("/health") && v.includes("RUNTIME-API-CONTRACT.md"))).toBe(true)
  })
})

describe("parseEventCatalog and compareEvents", () => {
  test("flags unknown emitted kinds, phantom catalog kinds, and payload key mismatches", () => {
    const catalog = parseEventCatalog(MINIMAL_CATALOG)
    expect([...catalog.types.keys()]).toEqual(["approval.updated", "governance.recorded", "authorization.requested"])
    expect(catalog.aggregation).toEqual(["approval.updated"])
    expect(catalog.breakthrough).toEqual(["approval.updated", "capability.revoked"])

    const emitted: EmittedEvent[] = [
      { type: "approval.updated", kind: "envelope", payloadKeys: ["approvalId", "status"] },
      { type: "governance.recorded", kind: "envelope", payloadKeys: ["recordId"] }, // missing sequence
      { type: "authorization.requested", kind: "inner" },
      { type: "runtime.mystery", kind: "inner" }, // unknown emitted kind
    ]
    const report = compareEvents(emitted, catalog)

    expect(report.undocumentedEmitted).toEqual(["runtime.mystery"])
    expect(report.phantomCatalog).toEqual([]) // every catalog kind has an emitter here
    expect(report.payloadMismatches).toHaveLength(1)
    expect(report.payloadMismatches[0]).toContain("governance.recorded")
    expect(report.catalogRefsUnknown).toEqual(["capability.revoked"])
  })

  test("no findings when emitted kinds and payload keys match the catalog", () => {
    const catalog = parseEventCatalog(MINIMAL_CATALOG)
    const emitted: EmittedEvent[] = [
      { type: "approval.updated", kind: "envelope", payloadKeys: ["approvalId", "status"] },
      { type: "governance.recorded", kind: "envelope", payloadKeys: ["recordId", "sequence"] },
      { type: "authorization.requested", kind: "inner" },
    ]
    const report = compareEvents(emitted, catalog)
    expect(report.undocumentedEmitted).toEqual([])
    expect(report.payloadMismatches).toEqual([])
  })
})

describe("structFieldNames and unionLiteralValues", () => {
  test("extracts property names from a Schema.Struct ast", () => {
    const fake = { ast: { propertySignatures: [{ name: "sessionID" }, { name: "approval" }, { name: "" }] } }
    expect(structFieldNames(fake)).toEqual(["sessionID", "approval"])
  })

  test("extracts string literals from a Schema.Union ast, walking nested unions", () => {
    const fake = {
      ast: {
        types: [
          { _tag: "Literal", literal: "approval.updated" },
          { _tag: "Literal", literal: "governance.recorded" },
          { _tag: "Union", types: [{ _tag: "Literal", literal: "session.status" }] },
        ],
      },
    }
    expect(unionLiteralValues(fake)).toEqual(["approval.updated", "governance.recorded", "session.status"])
  })
})

describe("summarize", () => {
  test("exits 1 when findings include an error, 0 when only info", () => {
    const withError = summarize([{ severity: "error", section: "surface", message: "boom" }])
    expect(withError.exitCode).toBe(1)
    expect(withError.text).toContain("1 error(s), 0 info(s)")

    const infoOnly = summarize([{ severity: "info", section: "surface", message: "note" }])
    expect(infoOnly.exitCode).toBe(0)
  })
})
