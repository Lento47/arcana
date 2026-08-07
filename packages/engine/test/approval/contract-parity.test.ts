/**
 * Runtime contract conformance: contracts/approval-api.v1.yaml, the mounted
 * runtime HttpApi, and the shared fixture suite must agree.
 *
 * The fixture file (contracts/fixtures/runtime-approval.v1.json) is the same
 * suite consumed by the generated SDK client test in packages/sdk/js.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { Schema } from "effect"
import { OpenApi } from "effect/unstable/httpapi"
import { InstanceHttpApi } from "../../src/server/routes/instance/httpapi/api"
import { ApprovalCommandPayload, ApprovalCommandResponse } from "../../src/server/routes/instance/httpapi/groups/approval"
import { RuntimeApprovalCommandPayload } from "../../src/server/routes/instance/httpapi/groups/runtime"
import { ApprovalRecordSchema } from "../../src/approval/events"
import YAML from "yaml"

const repoRoot = resolve(import.meta.dir, "../../../../")
const contract = YAML.parse(readFileSync(resolve(repoRoot, "contracts/approval-api.v1.yaml"), "utf8")) as any
const fixture = JSON.parse(
  readFileSync(resolve(repoRoot, "contracts/fixtures/runtime-approval.v1.json"), "utf8"),
) as any

type Method = "get" | "post" | "put" | "delete" | "patch"
type OpenApiSchema = {
  readonly $ref?: string
  readonly anyOf?: ReadonlyArray<OpenApiSchema>
  readonly oneOf?: ReadonlyArray<OpenApiSchema>
  readonly type?: string
  readonly enum?: readonly unknown[]
  readonly const?: unknown
  readonly properties?: Record<string, OpenApiSchema>
  readonly required?: readonly string[]
}
type OpenApiResponse = {
  readonly description?: string
  readonly content?: Record<string, { readonly schema?: OpenApiSchema }>
}
type OpenApiOperation = {
  readonly parameters?: ReadonlyArray<{
    readonly name: string
    readonly in: string
    readonly required?: boolean
    readonly schema?: { readonly type?: string }
  }>
  readonly responses?: Record<string, OpenApiResponse>
  readonly requestBody?: {
    readonly required?: boolean
    readonly content?: Record<string, { readonly schema?: OpenApiSchema }>
  }
}
type OpenApiPathItem = Partial<Record<Method, OpenApiOperation>>
type OpenApiSpec = {
  readonly paths: Record<string, OpenApiPathItem>
  readonly components: { readonly schemas: Record<string, OpenApiSchema> }
}

const runtimeSpec = OpenApi.fromApi(InstanceHttpApi) as OpenApiSpec

function postOp(spec: OpenApiSpec, path: string): OpenApiOperation {
  const operation = spec.paths[path]?.post
  expect(operation, `mounted runtime must expose POST ${path}`).toBeDefined()
  return operation!
}

function getOp(spec: OpenApiSpec, path: string): OpenApiOperation {
  const operation = spec.paths[path]?.get
  expect(operation, `mounted runtime must expose GET ${path}`).toBeDefined()
  return operation!
}

function bodySchema(operation: OpenApiOperation): OpenApiSchema {
  const schema = operation.requestBody?.content?.["application/json"]?.schema
  expect(schema, "requestBody schema must be defined").toBeDefined()
  return schema!
}

function resolveRef(spec: OpenApiSpec, schema: OpenApiSchema | undefined): OpenApiSchema {
  if (!schema?.$ref) return schema ?? {}
  const name = schema.$ref.replace("#/components/schemas/", "")
  return spec.components.schemas[name] ?? {}
}

function decode(schema: any, value: unknown): any {
  return Schema.decodeUnknownSync(schema)(value)
}

describe("runtime approval contract parity", () => {
  test("contract YAML approves/denies/revokes require the exact-request decision body", () => {
    const paths = contract.paths as Record<string, any>
    for (const path of [
      "/approvals/{approvalID}/approve",
      "/approvals/{approvalID}/deny",
      "/approvals/{approvalID}/revoke",
    ]) {
      const operation = paths[path].post
      expect(operation.requestBody.required, `${path} requestBody must be required`).toBe(true)
      expect(operation.requestBody.content["application/json"].schema.$ref).toBe(
        "#/components/schemas/DecisionBody",
      )
    }

    const decision = contract.components.schemas.DecisionBody as {
      required: string[]
      properties: Record<string, any>
    }
    expect(decision.required).toEqual(["expectedVersion", "expectedRequestHash", "expectedContractRevision"])
    expect(decision.properties.expectedVersion.type).toBe("integer")
    expect(decision.properties.expectedRequestHash.type).toBe("string")
    expect(decision.properties.expectedContractRevision.type).toBe("integer")
  })

  test("contract YAML documents the 200 success/failure union and no phantom 403/409", () => {
    const paths = contract.paths as Record<string, any>
    for (const path of [
      "/approvals/{approvalID}/approve",
      "/approvals/{approvalID}/deny",
      "/approvals/{approvalID}/revoke",
    ]) {
      const responses = paths[path].post.responses as Record<string, any>
      expect(responses["200"].content["application/json"].schema.$ref).toBe(
        "#/components/schemas/ApprovalCommandResult",
      )
      expect(responses["400"]).toBeDefined()
      expect(responses["403"], `${path} must not document a 403 transport error`).toBeUndefined()
      expect(responses["409"], `${path} must not document a 409 transport error`).toBeUndefined()
    }

    const result = contract.components.schemas.ApprovalCommandResult as { oneOf: Array<{ $ref: string }> }
    expect(result.oneOf.map((item) => item.$ref)).toEqual([
      "#/components/schemas/ApprovalCommandSuccess",
      "#/components/schemas/ApprovalCommandFailure",
    ])
    const failure = contract.components.schemas.ApprovalCommandFailure as {
      required: string[]
      properties: Record<string, any>
    }
    expect(failure.required).toEqual(["success", "reason"])
    expect(failure.properties.stale.type).toBe("boolean")
    expect(failure.properties.success.const).toBe(false)
    expect((contract.components.schemas.ApprovalCommandSuccess as any).properties.success.const).toBe(true)
  })

  test("contract YAML paths match the mounted runtime paths", () => {
    const yamlPaths = Object.keys(contract.paths as Record<string, any>).sort()
    const mountedPaths = Object.keys(runtimeSpec.paths)
      .filter((path) =>
        [
          "/approvals",
          "/approvals/{approvalID}",
          "/approvals/{approvalID}/affordances",
          "/approvals/{approvalID}/approve",
          "/approvals/{approvalID}/deny",
          "/approvals/{approvalID}/revoke",
          "/sessions",
          "/sessions/{sessionID}",
          "/proofs/{sessionID}",
          "/desktop/heartbeat",
        ].includes(path),
      )
      .sort()
    expect(yamlPaths).toEqual(mountedPaths)
  })

  test("runtime-generated OpenAPI and YAML agree on request and response parity", () => {
    const mountedApprove = postOp(runtimeSpec, "/approvals/{approvalID}/approve")
    const mountedBody = resolveRef(runtimeSpec, bodySchema(mountedApprove))
    expect([...(mountedBody.required ?? [])].sort()).toEqual([
      "expectedContractRevision",
      "expectedRequestHash",
      "expectedVersion",
    ])

    const mountedResponses = mountedApprove.responses ?? {}
    expect(mountedResponses["200"]).toBeDefined()
    expect(mountedResponses["403"], "mounted runtime must not emit 403").toBeUndefined()
    expect(mountedResponses["409"], "mounted runtime must not emit 409").toBeUndefined()

    const successSchema = resolveRef(
      runtimeSpec,
      mountedResponses["200"]?.content?.["application/json"]?.schema,
    )
    const variants = [...(successSchema.anyOf ?? []), ...(successSchema.oneOf ?? [])]
    expect(variants.length).toBeGreaterThanOrEqual(2)
    const schemas = variants.map((item) => resolveRef(runtimeSpec, item))
    const isSuccessLiteral = (schema: OpenApiSchema) =>
      schema.properties?.success?.enum?.includes(true) ?? schema.properties?.success?.const === true
    const isFailureLiteral = (schema: OpenApiSchema) =>
      schema.properties?.success?.enum?.includes(false) ?? schema.properties?.success?.const === false
    const okVariant = schemas.find(isSuccessLiteral)
    const failVariant = schemas.find(isFailureLiteral)
    expect(okVariant, "runtime 200 union must include success:true with approval").toBeDefined()
    expect(failVariant, "runtime 200 union must include success:false").toBeDefined()
    expect(failVariant!.required).toContain("reason")
    const staleSchema = failVariant!.properties?.stale
    expect(
      staleSchema?.type === "boolean" || (staleSchema?.anyOf ?? []).some((item) => item.type === "boolean"),
      "runtime failure variant must expose a boolean stale flag",
    ).toBe(true)
  })

  test("YAML ApprovalRecord matches the runtime wire schema", () => {
    const yamlRecord = contract.components.schemas.ApprovalRecord as {
      required: string[]
      properties: Record<string, any>
    }
    const runtimeFields = Object.keys(ApprovalRecordSchema.fields)
    expect(Object.keys(yamlRecord.properties).sort()).toEqual([...runtimeFields].sort())

    const runtimeRequired = runtimeSpec.components.schemas.ApprovalRecord?.required
    expect(runtimeRequired).toBeDefined()
    expect([...yamlRecord.required].sort()).toEqual([...runtimeRequired!].sort())
  })

  test("fixture requests decode with the runtime payload schemas", () => {
    for (const body of [fixture.requests.approve, fixture.requests.deny, fixture.requests.revoke]) {
      expect(decode(RuntimeApprovalCommandPayload, body)).toEqual(body)
    }
    expect(
      decode(ApprovalCommandPayload, { command: "APPROVE_ONCE", ...fixture.requests.approve }),
    ).toMatchObject(fixture.requests.approve)
    expect(decode(ApprovalCommandPayload, { command: "DENY", ...fixture.requests.deny })).toMatchObject(
      fixture.requests.deny,
    )
    expect(decode(ApprovalCommandPayload, { command: "REVOKE", ...fixture.requests.revoke })).toMatchObject(
      fixture.requests.revoke,
    )
  })

  test("fixture responses decode with the runtime command response schema", () => {
    for (const response of Object.values(fixture.responses) as Array<unknown>) {
      const decoded = decode(ApprovalCommandResponse, response)
      expect(decoded).toEqual(response)
    }
    for (const stale of [fixture.responses.staleHash, fixture.responses.staleVersion, fixture.responses.staleRevision]) {
      expect(stale.success).toBe(false)
      expect(stale.stale).toBe(true)
    }
  })

  test("fixture record decodes with the runtime ApprovalRecord schema", () => {
    const record = decode(ApprovalRecordSchema, fixture.record)
    expect(record.approvalId).toBe("appr_fixture_1")
    expect(record.requestHash).toBe("hash-fixture-abc-123")
  })

  test("contract YAML documents the session restriction header", () => {
    const header = (contract.components as any).parameters.SessionRestrictionHeader
    expect(header).toBeDefined()
    expect(header.in).toBe("header")
    expect(header.required).toBeFalsy()
    for (const path of [
      "/approvals/{approvalID}/approve",
      "/approvals/{approvalID}/deny",
      "/approvals/{approvalID}/revoke",
    ]) {
      const refs = (contract.paths as any)[path].post.parameters.map((parameter: any) => parameter.$ref)
      expect(refs).toContain("#/components/parameters/SessionRestrictionHeader")
    }
  })
})
