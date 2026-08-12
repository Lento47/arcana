/**
 * E-9: protocol extension registry enforcement tests.
 */

import { describe, expect, it } from "bun:test"
import {
  BUILTIN_EXTENSIONS,
  DEFAULT_EXTENSION_REGISTRY,
  KNOWN_VENDORS,
  inspectExtensionPayload,
  parseExtensionIdentifier,
  validateEnvelopeExtensionFields,
  validateExtensionDeclaration,
  validateExtensionIdentifier,
  validateExtensionRegistry,
  validateStrictSchema,
} from "./extension-registry"

describe("extension identifier parsing", () => {
  it("parses a namespaced identifier into vendor and name", () => {
    expect(parseExtensionIdentifier("x-arcana-session")).toEqual({
      identifier: "x-arcana-session",
      vendor: "arcana",
      name: "session",
    })
  })

  it("parses a hyphenated name as vendor + remainder", () => {
    expect(parseExtensionIdentifier("x-arcana-proof-batch")).toEqual({
      identifier: "x-arcana-proof-batch",
      vendor: "arcana",
      name: "proof-batch",
    })
  })

  it("rejects a non-namespaced identifier", () => {
    expect(parseExtensionIdentifier("arcana-session")).toBeNull()
    expect(parseExtensionIdentifier("session")).toBeNull()
  })

  it("rejects an identifier without a name segment", () => {
    expect(parseExtensionIdentifier("x-arcana-")).toBeNull()
    expect(parseExtensionIdentifier("x-arcana")).toBeNull()
  })

  it("rejects uppercase, underscores, and empty segments", () => {
    expect(parseExtensionIdentifier("x-Arcana-session")).toBeNull()
    expect(parseExtensionIdentifier("x-arcana_session")).toBeNull()
    expect(parseExtensionIdentifier("x--session")).toBeNull()
    expect(parseExtensionIdentifier("xx-arcana-session")).toBeNull()
  })

  it("rejects non-string identifiers", () => {
    expect(parseExtensionIdentifier(42)).toBeNull()
    expect(parseExtensionIdentifier(undefined)).toBeNull()
  })
})

describe("registry validation", () => {
  it("accepts the built-in registry with no issues", () => {
    expect(validateExtensionRegistry(DEFAULT_EXTENSION_REGISTRY)).toEqual([])
  })

  it("flags a duplicate registration", () => {
    const issues = validateExtensionRegistry([
      BUILTIN_EXTENSIONS[0]!,
      BUILTIN_EXTENSIONS[0]!,
    ])
    expect(issues.some((issue) => issue.message.includes("duplicate"))).toBe(true)
  })

  it("flags a conflicting name (vendor/name mismatch with identifier)", () => {
    const registry = new Map([
      [
        "x-arcana-session",
        { ...BUILTIN_EXTENSIONS[0]!, name: "other" },
      ],
    ])
    const issues = validateExtensionRegistry(registry)
    expect(issues.some((issue) => issue.message.includes("do not match"))).toBe(true)
  })

  it("flags an entry missing its security-semantics note", () => {
    const registry = new Map([
      ["x-arcana-session", { ...BUILTIN_EXTENSIONS[0]!, securitySemantics: "  " }],
    ])
    const issues = validateExtensionRegistry(registry)
    expect(issues.some((issue) => issue.message.includes("security-semantics"))).toBe(true)
  })

  it("flags an unknown vendor unless explicitly allowed", () => {
    const entry = { ...BUILTIN_EXTENSIONS[0]!, identifier: "x-acme-widget", vendor: "acme", name: "widget" }
    const registry = new Map([["x-acme-widget", entry]])
    expect(validateExtensionRegistry(registry).some((issue) => issue.message.includes("unknown vendor"))).toBe(true)
    expect(
      validateExtensionRegistry(registry, { allowUnknownVendors: true }),
    ).toEqual([])
  })
})

describe("extension identifier validation", () => {
  it("accepts a registered identifier from a known vendor", () => {
    const result = validateExtensionIdentifier("x-arcana-session")
    expect(result.valid).toBe(true)
  })

  it("rejects an unknown vendor", () => {
    const result = validateExtensionIdentifier("x-acme-widget")
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain("unknown extension vendor: acme")
  })

  it("rejects an unregistered identifier from a known vendor", () => {
    const result = validateExtensionIdentifier("x-arcana-widget")
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain("not registered")
  })

  it("accepts an unknown vendor when explicitly allowed", () => {
    const result = validateExtensionIdentifier("x-acme-widget", { allowUnknownVendors: true, requireRegistered: false })
    expect(result.valid).toBe(true)
  })

  it("rejects malformed identifiers", () => {
    expect(validateExtensionIdentifier("x-Arcana-session").valid).toBe(false)
    expect(validateExtensionIdentifier("arcana-session").valid).toBe(false)
  })
})

describe("extension declarations (strict schema)", () => {
  const validDeclaration = {
    identifier: "x-arcana-session",
    description: "Authenticated session restriction.",
    securitySemantics: "Grants nothing; never alters authorization or revocation semantics.",
  }

  it("accepts a well-formed declaration for a registered extension", () => {
    const result = validateExtensionDeclaration(validDeclaration)
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.parsed.vendor).toBe("arcana")
  })

  it("rejects a declaration missing a mandatory field", () => {
    const { securitySemantics: _omitted, ...incomplete } = validDeclaration
    const result = validateExtensionDeclaration(incomplete)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain("securitySemantics: missing required field")
  })

  it("rejects an unknown mandatory-looking field", () => {
    const result = validateExtensionDeclaration({ ...validDeclaration, mandatory: true })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain("mandatory: unknown field")
  })

  it("rejects an unregistered declaration", () => {
    const result = validateExtensionDeclaration({ ...validDeclaration, identifier: "x-arcana-widget" })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain("not registered")
  })

  it("rejects an unknown vendor in a declaration", () => {
    const result = validateExtensionDeclaration({ ...validDeclaration, identifier: "x-acme-widget" })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain("unknown extension vendor")
  })
})

describe("security semantics inspection", () => {
  it("accepts a payload that does not touch security semantics", () => {
    expect(inspectExtensionPayload("x-arcana-session", { retentionDays: 30, label: "ops" }).valid).toBe(true)
    expect(inspectExtensionPayload("x-arcana-contract", { status: "pre-release" }).valid).toBe(true)
  })

  it("rejects a payload touching revocation", () => {
    const result = inspectExtensionPayload("x-arcana-session", { revoke: true })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain("revoke")
  })

  it("rejects a payload touching signature input", () => {
    const result = inspectExtensionPayload("x-arcana-session", { signatureInput: "forged" })
    expect(result.valid).toBe(false)
  })

  it("rejects a payload touching canonical serialization", () => {
    const result = inspectExtensionPayload("x-arcana-session", { canonical: { order: "custom" } })
    expect(result.valid).toBe(false)
  })

  it("rejects nested security-sensitive fields", () => {
    const result = inspectExtensionPayload("x-arcana-session", { flags: { autoApproval: true } })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain("autoApproval")
  })

  it("rejects camelCase security-sensitive fields", () => {
    const result = inspectExtensionPayload("x-arcana-session", { revocationStatement: "x" })
    expect(result.valid).toBe(false)
  })

  it("rejects non-canonical values (undefined, non-finite)", () => {
    expect(inspectExtensionPayload("x-arcana-session", { a: undefined }).valid).toBe(false)
    expect(inspectExtensionPayload("x-arcana-session", { a: Number.NaN }).valid).toBe(false)
    expect(inspectExtensionPayload("x-arcana-session", { a: Infinity }).valid).toBe(false)
  })

  it("rejects payloads exceeding the nesting limit", () => {
    let nested: Record<string, unknown> = { leaf: 1 }
    for (let i = 0; i < 20; i++) nested = { next: nested }
    const result = inspectExtensionPayload("x-arcana-session", nested)
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain("nesting exceeds limit")
  })

  it("rejects a malformed identifier in the inspection call", () => {
    expect(inspectExtensionPayload("arcana-session", {}).valid).toBe(false)
  })
})

describe("envelope extension gate", () => {
  it("accepts an envelope with a registered, safe extension field", () => {
    const result = validateEnvelopeExtensionFields({ "x-arcana-session": { sessionId: "s-1" } })
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.extensions[0]!.name).toBe("session")
  })

  it("accepts an envelope with no extension fields", () => {
    const result = validateEnvelopeExtensionFields({ schemaVersion: 1, signature: "abc" })
    expect(result.valid).toBe(true)
    if (result.valid) expect(result.extensions).toEqual([])
  })

  it("rejects an unknown-vendor extension field", () => {
    const result = validateEnvelopeExtensionFields({ "x-acme-widget": {} })
    expect(result.valid).toBe(false)
    if (!result.valid) expect(result.reason).toContain("unknown extension vendor")
  })

  it("rejects a malformed extension field", () => {
    const result = validateEnvelopeExtensionFields({ "x-arcana": {} })
    expect(result.valid).toBe(false)
  })

  it("rejects a security-tampering registered extension field", () => {
    const result = validateEnvelopeExtensionFields({ "x-arcana-session": { revoke: true } })
    expect(result.valid).toBe(false)
  })
})

describe("strict schema helper", () => {
  const required = ["a", "b"]
  const allowed = new Set<string>(["a", "b"])

  it("returns no issues for a valid payload", () => {
    expect(validateStrictSchema({ a: 1, b: 2 }, required, allowed)).toEqual([])
  })

  it("flags a missing required field", () => {
    const issues = validateStrictSchema({ a: 1 }, required, allowed)
    expect(issues.some((issue) => issue.field === "b" && issue.message.includes("missing"))).toBe(true)
  })

  it("flags an unknown field", () => {
    const issues = validateStrictSchema({ a: 1, b: 2, c: 3 }, required, allowed)
    expect(issues.some((issue) => issue.field === "c" && issue.message === "unknown field")).toBe(true)
  })

  it("flags an undefined value", () => {
    const issues = validateStrictSchema({ a: 1, b: undefined }, required, allowed)
    expect(issues.some((issue) => issue.field === "b" && issue.message === "undefined value")).toBe(true)
  })
})

describe("built-in registry invariants", () => {
  it("every built-in extension is registered under a known vendor", () => {
    expect(validateExtensionRegistry(DEFAULT_EXTENSION_REGISTRY)).toEqual([])
    for (const entry of BUILTIN_EXTENSIONS) {
      expect(KNOWN_VENDORS).toContain(entry.vendor)
      expect(DEFAULT_EXTENSION_REGISTRY.get(entry.identifier)?.description.length).toBeGreaterThan(0)
      expect(DEFAULT_EXTENSION_REGISTRY.get(entry.identifier)?.securitySemantics.length).toBeGreaterThan(0)
    }
  })
})
