/**
 * Phase C: Consequential field lineage tests
 */

import { describe, expect, it } from "bun:test"
import {
  classifyFieldLineage,
  assessFieldLineage,
  assessRequestLineage,
  CONSEQUENTIAL_FIELDS,
} from "@arcana/core/capability/field-lineage"

describe("Field lineage classification", () => {
  it("USER_INSTRUCTION → DIRECT transformation", () => {
    const lineage = classifyFieldLineage(
      "resource.path",
      "packages/engine/src/foo.ts",
      ["USER_INSTRUCTION"],
      ["PUBLIC"],
    )
    expect(lineage.transformation).toBe("DIRECT")
    expect(lineage.sensitivity).toBe("PUBLIC")
  })

  it("MODEL_OUTPUT → MODEL_DERIVED transformation", () => {
    const lineage = classifyFieldLineage(
      "executable",
      "bun",
      ["MODEL_OUTPUT"],
      ["PUBLIC"],
    )
    expect(lineage.transformation).toBe("MODEL_DERIVED")
  })

  it("REMOTE_CONTENT → MODEL_DERIVED transformation", () => {
    const lineage = classifyFieldLineage(
      "arguments",
      "test --filter=foo",
      ["REMOTE_CONTENT", "MODEL_OUTPUT"],
      ["PUBLIC"],
    )
    expect(lineage.transformation).toBe("MODEL_DERIVED")
  })

  it("SECRET sensitivity is preserved", () => {
    const lineage = classifyFieldLineage(
      "secretIdentifier",
      "API_KEY",
      ["USER_INSTRUCTION"],
      ["SECRET"],
    )
    expect(lineage.sensitivity).toBe("SECRET")
  })

  it("base64 value → ENCODED transformation", () => {
    const lineage = classifyFieldLineage(
      "arguments",
      "SGVsbG8gV29ybGQ=",
      ["MODEL_OUTPUT"],
      ["PUBLIC"],
    )
    expect(lineage.transformation).toBe("ENCODED")
  })
})

describe("Field lineage assessment", () => {
  it("DIRECT lineage on HIGH action → SAFE", () => {
    const lineage = classifyFieldLineage("executable", "bun", ["USER_INSTRUCTION"], ["PUBLIC"])
    const result = assessFieldLineage(lineage, "process.execute", "HIGH")
    expect(result.risk).toBe("SAFE")
  })

  it("UNKNOWN lineage on HIGH action → DENY", () => {
    const lineage = classifyFieldLineage("executable", "bun", [], ["PUBLIC"])
    const result = assessFieldLineage(lineage, "process.execute", "HIGH")
    expect(result.risk).toBe("DENY")
    expect(result.reason).toContain("UNKNOWN lineage")
  })

  it("REMOTE_CONTENT on process.execute → REQUIRES_CHECK", () => {
    const lineage = classifyFieldLineage(
      "arguments",
      "rm -rf /",
      ["REMOTE_CONTENT", "MODEL_OUTPUT"],
      ["PUBLIC"],
    )
    const result = assessFieldLineage(lineage, "process.execute", "HIGH")
    expect(result.risk).toBe("REQUIRES_CHECK")
    expect(result.reason).toContain("REMOTE_CONTENT")
  })

  it("MCP_DESCRIPTION on secret.use → DENY", () => {
    const lineage = classifyFieldLineage(
      "secretIdentifier",
      "API_KEY",
      ["MCP_DESCRIPTION"],
      ["SECRET"],
    )
    const result = assessFieldLineage(lineage, "secret.use", "HIGH")
    expect(result.risk).toBe("DENY")
    expect(result.reason).toContain("MCP_DESCRIPTION")
  })

  it("SECRET in ENCODED form → DENY", () => {
    const lineage = classifyFieldLineage(
      "networkBody",
      "SGVsbG8gV29ybGQ=",
      ["MODEL_OUTPUT"],
      ["SECRET"],
    )
    const result = assessFieldLineage(lineage, "network.write", "HIGH")
    expect(result.risk).toBe("DENY")
    expect(result.reason).toContain("exfiltration")
  })
})

describe("Request-level lineage assessment", () => {
  it("all DIRECT fields → SAFE", () => {
    const fields = {
      "resource.path": "packages/engine/src/foo.ts",
      "executable": "bun",
      "arguments": "test",
    }

    const result = assessRequestLineage(
      fields,
      ["USER_INSTRUCTION"],
      ["PUBLIC"],
      "process.execute",
      "HIGH",
    )
    expect(result.overall).toBe("SAFE")
  })

  it("REMOTE_CONTENT in arguments on process.execute → REQUIRES_CHECK", () => {
    const fields = {
      "executable": "bun",
      "arguments": "test --filter=malicious",
    }

    const result = assessRequestLineage(
      fields,
      ["REMOTE_CONTENT", "MODEL_OUTPUT"],
      ["PUBLIC"],
      "process.execute",
      "HIGH",
    )
    expect(result.overall).toBe("REQUIRES_CHECK")
  })

  it("UNKNOWN lineage on CRITICAL action → DENY", () => {
    const fields = {
      "networkDestination": "evil.com",
    }

    const result = assessRequestLineage(
      fields,
      [],
      ["PUBLIC"],
      "network.write",
      "CRITICAL",
    )
    expect(result.overall).toBe("DENY")
  })
})
