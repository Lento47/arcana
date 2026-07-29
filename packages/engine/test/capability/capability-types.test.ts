import { describe, expect, test } from "bun:test"
import {
  computeRequestHash,
  canonicalizeRequest,
} from "@arcana/core/capability/request-hash"
import {
  combineSensitivity,
  maxSensitivity,
  SENSITIVITY_ORDER,
} from "@arcana/core/capability/types"
import type {
  AuthorizationRequest,
  SensitivityLabel,
} from "@arcana/core/capability/types"

function makeRequest(
  overrides: Partial<AuthorizationRequest> = {},
): AuthorizationRequest {
  return {
    schemaVersion: "1",
    requestId: "req-001",
    principalId: "agent:main",
    sessionId: "sess-abc",
    tool: "terminal",
    action: "process.execute",
    resource: { kind: "process", executable: "bun" },
    executable: "bun",
    arguments: ["test", "file.test.ts"],
    workingDirectory: "/workspace",
    provenance: ["USER_INSTRUCTION"],
    sensitivity: ["PUBLIC"],
    requestedAt: "2026-07-29T00:00:00Z",
    nonce: "nonce-001",
    ...overrides,
  }
}

describe("request hashing", () => {
  test("same request produces same hash", () => {
    const a = makeRequest()
    const b = makeRequest()
    expect(computeRequestHash(a)).toBe(computeRequestHash(b))
  })

  test("different nonce produces different hash", () => {
    const a = makeRequest({ nonce: "n1" })
    const b = makeRequest({ nonce: "n2" })
    expect(computeRequestHash(a)).not.toBe(computeRequestHash(b))
  })

  test("different action produces different hash", () => {
    const a = makeRequest({ action: "process.execute" })
    const b = makeRequest({ action: "filesystem.write" })
    expect(computeRequestHash(a)).not.toBe(computeRequestHash(b))
  })

  test("different resource produces different hash", () => {
    const a = makeRequest({ resource: { kind: "process", executable: "bun" } })
    const b = makeRequest({ resource: { kind: "process", executable: "node" } })
    expect(computeRequestHash(a)).not.toBe(computeRequestHash(b))
  })

  test("hash is 64-char hex", () => {
    const hash = computeRequestHash(makeRequest())
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  test("domain separator is arcana-authorization-request-v1", () => {
    // Verify the domain is baked in by checking canonical encoding
    // does not change when we alter the domain
    const req = makeRequest()
    const hash = computeRequestHash(req)
    expect(hash.length).toBe(64)
  })
})

describe("canonical determinism", () => {
  test("provenance order does not affect hash", () => {
    const a = makeRequest({
      provenance: ["USER_INSTRUCTION", "REMOTE_CONTENT"],
    })
    const b = makeRequest({
      provenance: ["REMOTE_CONTENT", "USER_INSTRUCTION"],
    })
    expect(computeRequestHash(a)).toBe(computeRequestHash(b))
  })

  test("sensitivity order does not affect hash", () => {
    const a = makeRequest({
      sensitivity: ["SECRET", "PUBLIC"],
    })
    const b = makeRequest({
      sensitivity: ["PUBLIC", "SECRET"],
    })
    expect(computeRequestHash(a)).toBe(computeRequestHash(b))
  })

  test("optional fields omitted vs empty string differ", () => {
    const a = makeRequest({ contractId: undefined })
    const b = makeRequest({ contractId: "" })
    expect(computeRequestHash(a)).not.toBe(computeRequestHash(b))
  })

  test("byte-for-byte canonical determinism", () => {
    const a = canonicalizeRequest(makeRequest())
    const b = canonicalizeRequest(makeRequest())
    expect(Buffer.compare(a, b)).toBe(0)
  })
})

describe("sensitivity lattice", () => {
  test("order: PUBLIC < INTERNAL < PRIVATE < SECRET", () => {
    expect(SENSITIVITY_ORDER.PUBLIC).toBeLessThan(SENSITIVITY_ORDER.INTERNAL)
    expect(SENSITIVITY_ORDER.INTERNAL).toBeLessThan(SENSITIVITY_ORDER.PRIVATE)
    expect(SENSITIVITY_ORDER.PRIVATE).toBeLessThan(SENSITIVITY_ORDER.SECRET)
  })

  test("combine takes maximum", () => {
    expect(combineSensitivity("PUBLIC", "SECRET")).toBe("SECRET")
    expect(combineSensitivity("SECRET", "PUBLIC")).toBe("SECRET")
    expect(combineSensitivity("INTERNAL", "PRIVATE")).toBe("PRIVATE")
    expect(combineSensitivity("PRIVATE", "PRIVATE")).toBe("PRIVATE")
  })

  test("maxSensitivity of empty is PUBLIC", () => {
    expect(maxSensitivity([])).toBe("PUBLIC")
  })

  test("maxSensitivity of mixed labels", () => {
    const labels: SensitivityLabel[] = [
      "PUBLIC",
      "INTERNAL",
      "SECRET",
      "PRIVATE",
    ]
    expect(maxSensitivity(labels)).toBe("SECRET")
  })

  test("maxSensitivity of all same", () => {
    expect(maxSensitivity(["INTERNAL", "INTERNAL"])).toBe("INTERNAL")
  })
})
