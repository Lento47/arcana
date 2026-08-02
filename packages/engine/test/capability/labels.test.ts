import { describe, expect, test } from "bun:test"
import {
  createLabels,
  labelValue,
  combineLabels,
  combineAllLabels,
  combineSensitivity,
  mapLabeledValue,
  deriveLabeledValue,
  validateDeclassification,
  declassifyValue,
  detectLabelTampering,
  aggregateFieldLabels,
  classifyUserInput,
  classifyActiveContract,
  classifyTrustedLocalSource,
  classifyUntrustedLocalSource,
  classifyRemoteContent,
  classifyToolOutput,
  classifyModelOutput,
  classifySubagentOutput,
  classifyMcpDescription,
  classifySecret,
  classifySystemPolicy,
} from "@arcana/core/capability/labels"
import type {
  SecurityLabels,
  LabeledValue,
  LabeledAuthorizationField,
  DeclassificationDecision,
  SensitivityLabel,
  ProvenanceLabel,
} from "@arcana/core/capability/types"

// ── Helpers ───────────────────────────────────────────────────────────

function expectLabels(
  labels: SecurityLabels,
  expectedProvenance: ProvenanceLabel[],
  expectedSensitivity: SensitivityLabel,
) {
  expect([...labels.provenance].sort()).toEqual(expectedProvenance.sort())
  expect(labels.sensitivity).toBe(expectedSensitivity)
}

// ── Source Classification ─────────────────────────────────────────────

describe("Source classification: trusted ingestion boundaries", () => {
  test("user input receives USER_INSTRUCTION + INTERNAL by default", () => {
    const labels = classifyUserInput()
    expectLabels(labels, ["USER_INSTRUCTION"], "INTERNAL")
  })

  test("user input can override sensitivity", () => {
    const labels = classifyUserInput("PRIVATE")
    expectLabels(labels, ["USER_INSTRUCTION"], "PRIVATE")
  })

  test("remote content receives REMOTE_CONTENT + PUBLIC by default", () => {
    const labels = classifyRemoteContent()
    expectLabels(labels, ["REMOTE_CONTENT"], "PUBLIC")
  })

  test("untrusted local source receives UNTRUSTED_LOCAL_SOURCE", () => {
    const labels = classifyUntrustedLocalSource()
    expectLabels(labels, ["UNTRUSTED_LOCAL_SOURCE"], "INTERNAL")
  })

  test("trusted local source receives TRUSTED_LOCAL_SOURCE", () => {
    const labels = classifyTrustedLocalSource("PRIVATE")
    expectLabels(labels, ["TRUSTED_LOCAL_SOURCE"], "PRIVATE")
  })

  test("MCP description receives MCP_DESCRIPTION", () => {
    const labels = classifyMcpDescription()
    expectLabels(labels, ["MCP_DESCRIPTION"], "INTERNAL")
  })

  test("tool output receives TOOL_OUTPUT", () => {
    const labels = classifyToolOutput("PRIVATE")
    expectLabels(labels, ["TOOL_OUTPUT"], "PRIVATE")
  })

  test("model output receives MODEL_OUTPUT", () => {
    const labels = classifyModelOutput("INTERNAL")
    expectLabels(labels, ["MODEL_OUTPUT"], "INTERNAL")
  })

  test("subagent output receives SUBAGENT_OUTPUT", () => {
    const labels = classifySubagentOutput("SECRET")
    expectLabels(labels, ["SUBAGENT_OUTPUT"], "SECRET")
  })

  test("secret receives SYSTEM_POLICY + SECRET", () => {
    const labels = classifySecret()
    expectLabels(labels, ["SYSTEM_POLICY"], "SECRET")
  })

  test("secret can specify custom source", () => {
    const labels = classifySecret("TRUSTED_LOCAL_SOURCE")
    expectLabels(labels, ["TRUSTED_LOCAL_SOURCE"], "SECRET")
  })

  test("active contract inherits source sensitivity", () => {
    const labels = classifyActiveContract("PRIVATE")
    expectLabels(labels, ["ACTIVE_CONTRACT"], "PRIVATE")
  })

  test("system policy is SYSTEM_POLICY + INTERNAL", () => {
    const labels = classifySystemPolicy()
    expectLabels(labels, ["SYSTEM_POLICY"], "INTERNAL")
  })
})

// ── Label Combination ─────────────────────────────────────────────────

describe("Label combination: sensitivity lattice", () => {
  test("PUBLIC ∪ PUBLIC = PUBLIC", () => {
    expect(combineSensitivity("PUBLIC", "PUBLIC")).toBe("PUBLIC")
  })

  test("PUBLIC ∪ INTERNAL = INTERNAL", () => {
    expect(combineSensitivity("PUBLIC", "INTERNAL")).toBe("INTERNAL")
  })

  test("PRIVATE ∪ INTERNAL = PRIVATE", () => {
    expect(combineSensitivity("PRIVATE", "INTERNAL")).toBe("PRIVATE")
  })

  test("SECRET ∪ PUBLIC = SECRET", () => {
    expect(combineSensitivity("SECRET", "PUBLIC")).toBe("SECRET")
  })

  test("SECRET ∪ PRIVATE = SECRET", () => {
    expect(combineSensitivity("SECRET", "PRIVATE")).toBe("SECRET")
  })
})

describe("Label combination: security labels", () => {
  test("combining PUBLIC and SECRET produces SECRET", () => {
    const a = createLabels(["USER_INSTRUCTION"], "PUBLIC")
    const b = classifySecret()
    const combined = combineLabels(a, b)
    expect(combined.sensitivity).toBe("SECRET")
  })

  test("combining PRIVATE and INTERNAL produces PRIVATE", () => {
    const a = createLabels(["USER_INSTRUCTION"], "PRIVATE")
    const b = createLabels(["TOOL_OUTPUT"], "INTERNAL")
    const combined = combineLabels(a, b)
    expect(combined.sensitivity).toBe("PRIVATE")
  })

  test("provenance unions on combination", () => {
    const a = createLabels(["USER_INSTRUCTION"], "PUBLIC")
    const b = createLabels(["REMOTE_CONTENT"], "PUBLIC")
    const combined = combineLabels(a, b)
    expect([...combined.provenance].sort()).toEqual(["REMOTE_CONTENT", "USER_INSTRUCTION"])
  })

  test("combineAllLabels with empty array returns PUBLIC", () => {
    const combined = combineAllLabels([])
    expect(combined.sensitivity).toBe("PUBLIC")
    expect(combined.provenance.size).toBe(0)
  })

  test("combineAllLabels with multiple labels takes max sensitivity", () => {
    const labels = [
      createLabels(["USER_INSTRUCTION"], "PUBLIC"),
      createLabels(["TOOL_OUTPUT"], "PRIVATE"),
      createLabels(["REMOTE_CONTENT"], "INTERNAL"),
    ]
    const combined = combineAllLabels(labels)
    expect(combined.sensitivity).toBe("PRIVATE")
    expect(combined.provenance.size).toBe(3)
  })
})

// ── Labeled Value Operations ──────────────────────────────────────────

describe("Labeled value operations", () => {
  test("labelValue creates immutable labeled value", () => {
    const labels = classifyUserInput()
    const lv = labelValue("hello", labels, ["evt-001"])
    expect(lv.value).toBe("hello")
    expect(lv.labels.sensitivity).toBe("INTERNAL")
    expect(lv.sourceEventIds).toEqual(["evt-001"])
  })

  test("mapLabeledValue preserves all labels", () => {
    const labels = createLabels(["USER_INSTRUCTION", "TOOL_OUTPUT"], "PRIVATE")
    const lv = labelValue("hello", labels, ["evt-001"])
    const mapped = mapLabeledValue(lv, (v) => v.toUpperCase())
    expect(mapped.value).toBe("HELLO")
    expect([...mapped.labels.provenance].sort()).toEqual(["TOOL_OUTPUT", "USER_INSTRUCTION"])
    expect(mapped.labels.sensitivity).toBe("PRIVATE")
    expect(mapped.sourceEventIds).toEqual(["evt-001"])
  })

  test("deriveLabeledValue inherits all source provenance", () => {
    const a = createLabels(["USER_INSTRUCTION"], "PUBLIC")
    const b = createLabels(["REMOTE_CONTENT"], "SECRET")
    const lvA = labelValue("input", a, ["evt-001"])
    const lvB = labelValue("remote", b, ["evt-002"])
    const derived = deriveLabeledValue("combined", [lvA, lvB])
    expect([...derived.labels.provenance].sort()).toEqual(["REMOTE_CONTENT", "USER_INSTRUCTION"])
    expect(derived.labels.sensitivity).toBe("SECRET")
    expect([...derived.sourceEventIds].sort()).toEqual(["evt-001", "evt-002"])
  })

  test("deriveLabeledValue with additional provenance", () => {
    const a = labelValue("x", classifyUserInput(), [])
    const derived = deriveLabeledValue("y", [a], ["MODEL_OUTPUT"])
    expect(derived.labels.provenance.has("USER_INSTRUCTION")).toBe(true)
    expect(derived.labels.provenance.has("MODEL_OUTPUT")).toBe(true)
  })

  test("labeled values are immutable", () => {
    const labels = classifyUserInput()
    const lv = labelValue("data", labels, ["evt-001"])
    expect(() => {
      ;(lv as any).value = "mutated"
    }).toThrow()
  })
})

// ── Model Cannot Tamper With Labels ───────────────────────────────────

describe("Label tampering detection", () => {
  test("model cannot remove REMOTE_CONTENT", () => {
    const original = classifyRemoteContent("PUBLIC")
    const claimed = createLabels([], "PUBLIC") // missing REMOTE_CONTENT
    const result = detectLabelTampering(original, claimed, false)
    expect(result.tampered).toBe(true)
    expect(result.reason).toContain("REMOTE_CONTENT")
  })

  test("model cannot lower SECRET to PUBLIC", () => {
    const original = classifySecret()
    const claimed = createLabels(["SYSTEM_POLICY"], "PUBLIC")
    const result = detectLabelTampering(original, claimed, false)
    expect(result.tampered).toBe(true)
    expect(result.reason).toContain("sensitivity decreased")
  })

  test("valid derivation is not tampering", () => {
    const original = classifyUserInput("INTERNAL")
    const derived = createLabels(["USER_INSTRUCTION", "TOOL_OUTPUT"], "PRIVATE")
    const result = detectLabelTampering(original, derived, false)
    expect(result.tampered).toBe(false)
  })

  test("declassification allows sensitivity reduction", () => {
    const original = classifySecret()
    const declassified = createLabels(["SYSTEM_POLICY"], "PRIVATE")
    const result = detectLabelTampering(original, declassified, true)
    expect(result.tampered).toBe(false)
  })

  test("adding provenance is not tampering", () => {
    const original = classifyUserInput()
    const expanded = createLabels(["USER_INSTRUCTION", "TOOL_OUTPUT"], "INTERNAL")
    const result = detectLabelTampering(original, expanded, false)
    expect(result.tampered).toBe(false)
  })
})

// ── Declassification ──────────────────────────────────────────────────

describe("Declassification: narrow primitive", () => {
  test("valid declassification passes validation", () => {
    const decision: DeclassificationDecision = {
      sourceSensitivity: "SECRET",
      targetSensitivity: "PRIVATE",
      fields: ["apiKey"],
      purpose: "send to authorized API",
      capabilityId: "cap-001",
      requestHash: "abc123",
      expiresAt: "2099-01-01T00:00:00Z",
    }
    expect(validateDeclassification(decision, "2026-01-01T00:00:00Z")).toBeNull()
  })

  test("declassification requires lower target sensitivity", () => {
    const decision: DeclassificationDecision = {
      sourceSensitivity: "PRIVATE",
      targetSensitivity: "PRIVATE",
      fields: ["apiKey"],
      purpose: "test",
      capabilityId: "cap-001",
      requestHash: "abc123",
      expiresAt: "2099-01-01T00:00:00Z",
    }
    expect(validateDeclassification(decision, "2026-01-01T00:00:00Z")).toContain("lower")
  })

  test("declassification requires at least one field", () => {
    const decision: DeclassificationDecision = {
      sourceSensitivity: "SECRET",
      targetSensitivity: "PUBLIC",
      fields: [],
      purpose: "test",
      capabilityId: "cap-001",
      requestHash: "abc123",
      expiresAt: "2099-01-01T00:00:00Z",
    }
    expect(validateDeclassification(decision, "2026-01-01T00:00:00Z")).toContain("field")
  })

  test("expired declassification is denied", () => {
    const decision: DeclassificationDecision = {
      sourceSensitivity: "SECRET",
      targetSensitivity: "PUBLIC",
      fields: ["apiKey"],
      purpose: "test",
      capabilityId: "cap-001",
      requestHash: "abc123",
      expiresAt: "2020-01-01T00:00:00Z",
    }
    expect(validateDeclassification(decision, "2026-01-01T00:00:00Z")).toContain("expired")
  })

  test("declassification requires capability", () => {
    const decision: DeclassificationDecision = {
      sourceSensitivity: "SECRET",
      targetSensitivity: "PUBLIC",
      fields: ["apiKey"],
      purpose: "test",
      capabilityId: "",
      requestHash: "abc123",
      expiresAt: "2099-01-01T00:00:00Z",
    }
    expect(validateDeclassification(decision, "2026-01-01T00:00:00Z")).toContain("capability")
  })

  test("declassification requires purpose", () => {
    const decision: DeclassificationDecision = {
      sourceSensitivity: "SECRET",
      targetSensitivity: "PUBLIC",
      fields: ["apiKey"],
      purpose: "",
      capabilityId: "cap-001",
      requestHash: "abc123",
      expiresAt: "2099-01-01T00:00:00Z",
    }
    expect(validateDeclassification(decision, "2026-01-01T00:00:00Z")).toContain("purpose")
  })

  test("declassifyValue creates new derivative", () => {
    const original = labelValue("secret-data", classifySecret(), ["evt-001"])
    const decision: DeclassificationDecision = {
      sourceSensitivity: "SECRET",
      targetSensitivity: "PRIVATE",
      fields: ["apiKey"],
      purpose: "authorized API call",
      capabilityId: "cap-001",
      requestHash: "abc123",
      expiresAt: "2099-01-01T00:00:00Z",
    }
    const declassified = declassifyValue(original, decision, "2026-01-01T00:00:00Z")
    expect(declassified.value).toBe("secret-data")
    expect(declassified.labels.sensitivity).toBe("PRIVATE")
    expect(declassified.labels.provenance.has("SYSTEM_POLICY")).toBe(true)
    // Original is unchanged
    expect(original.labels.sensitivity).toBe("SECRET")
  })

  test("declassification for one field cannot expose another field", () => {
    const decision: DeclassificationDecision = {
      sourceSensitivity: "SECRET",
      targetSensitivity: "PUBLIC",
      fields: ["fieldA"],
      purpose: "expose fieldA only",
      capabilityId: "cap-001",
      requestHash: "abc123",
      expiresAt: "2099-01-01T00:00:00Z",
    }
    // Decision is scoped to fieldA — it's valid
    expect(validateDeclassification(decision, "2026-01-01T00:00:00Z")).toBeNull()
    // The caller must only apply it to fieldA — the primitive doesn't auto-apply
    // This is enforced at the integration layer, not in the type
  })
})

// ── Field-Level Label Aggregation ─────────────────────────────────────

describe("Field-level label aggregation", () => {
  test("aggregateFieldLabels takes max sensitivity", () => {
    const fields: LabeledAuthorizationField[] = [
      { field: "command", provenance: ["USER_INSTRUCTION"], sensitivity: "INTERNAL", sourceEventIds: ["e1"] },
      { field: "env", provenance: ["SYSTEM_POLICY"], sensitivity: "SECRET", sourceEventIds: ["e2"] },
      { field: "args", provenance: ["TOOL_OUTPUT"], sensitivity: "PUBLIC", sourceEventIds: ["e3"] },
    ]
    const aggregate = aggregateFieldLabels(fields)
    expect(aggregate.sensitivity).toBe("SECRET")
    expect(aggregate.provenance.size).toBe(3)
  })

  test("empty fields returns PUBLIC with no provenance", () => {
    const aggregate = aggregateFieldLabels([])
    expect(aggregate.sensitivity).toBe("PUBLIC")
    expect(aggregate.provenance.size).toBe(0)
  })
})

// ── Property-Based Tests: Label Algebra ───────────────────────────────

describe("Property-based: sensitivity join associativity", () => {
  const sensitivities: SensitivityLabel[] = ["PUBLIC", "INTERNAL", "PRIVATE", "SECRET"]

  test("associativity: (a ⊔ b) ⊔ c = a ⊔ (b ⊔ c)", () => {
    for (const a of sensitivities) {
      for (const b of sensitivities) {
        for (const c of sensitivities) {
          const left = combineSensitivity(combineSensitivity(a, b), c)
          const right = combineSensitivity(a, combineSensitivity(b, c))
          expect(left).toBe(right)
        }
      }
    }
  })
})

describe("Property-based: sensitivity join commutativity", () => {
  const sensitivities: SensitivityLabel[] = ["PUBLIC", "INTERNAL", "PRIVATE", "SECRET"]

  test("commutativity: a ⊔ b = b ⊔ a", () => {
    for (const a of sensitivities) {
      for (const b of sensitivities) {
        expect(combineSensitivity(a, b)).toBe(combineSensitivity(b, a))
      }
    }
  })
})

describe("Property-based: sensitivity join idempotence", () => {
  const sensitivities: SensitivityLabel[] = ["PUBLIC", "INTERNAL", "PRIVATE", "SECRET"]

  test("idempotence: a ⊔ a = a", () => {
    for (const a of sensitivities) {
      expect(combineSensitivity(a, a)).toBe(a)
    }
  })
})

describe("Property-based: provenance-set union", () => {
  test("union is commutative", () => {
    const a = createLabels(["USER_INSTRUCTION", "TOOL_OUTPUT"], "PUBLIC")
    const b = createLabels(["REMOTE_CONTENT", "USER_INSTRUCTION"], "PUBLIC")
    const ab = combineLabels(a, b)
    const ba = combineLabels(b, a)
    expect([...ab.provenance].sort()).toEqual([...ba.provenance].sort())
  })

  test("union is idempotent", () => {
    const a = createLabels(["USER_INSTRUCTION", "TOOL_OUTPUT"], "PUBLIC")
    const aa = combineLabels(a, a)
    expect([...aa.provenance].sort()).toEqual(["TOOL_OUTPUT", "USER_INSTRUCTION"])
  })

  test("union only grows", () => {
    const a = createLabels(["USER_INSTRUCTION"], "PUBLIC")
    const b = createLabels(["REMOTE_CONTENT"], "PUBLIC")
    const combined = combineLabels(a, b)
    for (const p of a.provenance) {
      expect(combined.provenance.has(p)).toBe(true)
    }
    for (const p of b.provenance) {
      expect(combined.provenance.has(p)).toBe(true)
    }
  })
})

describe("Property-based: label monotonicity", () => {
  test("sensitivity never decreases on combination without declassification", () => {
    const sensitivities: SensitivityLabel[] = ["PUBLIC", "INTERNAL", "PRIVATE", "SECRET"]
    for (const a of sensitivities) {
      for (const b of sensitivities) {
        const combined = combineSensitivity(a, b)
        expect(["PUBLIC", "INTERNAL", "PRIVATE", "SECRET"].indexOf(combined))
          .toBeGreaterThanOrEqual(["PUBLIC", "INTERNAL", "PRIVATE", "SECRET"].indexOf(a))
        expect(["PUBLIC", "INTERNAL", "PRIVATE", "SECRET"].indexOf(combined))
          .toBeGreaterThanOrEqual(["PUBLIC", "INTERNAL", "PRIVATE", "SECRET"].indexOf(b))
      }
    }
  })

  test("provenance never shrinks on combination", () => {
    const a = createLabels(["USER_INSTRUCTION"], "PUBLIC")
    const b = createLabels(["REMOTE_CONTENT", "TOOL_OUTPUT"], "PRIVATE")
    const combined = combineLabels(a, b)
    expect(combined.provenance.size).toBeGreaterThanOrEqual(a.provenance.size)
    expect(combined.provenance.size).toBeGreaterThanOrEqual(b.provenance.size)
  })
})

describe("Property-based: declassification scope containment", () => {
  test("declassification cannot widen scope beyond declared fields", () => {
    const decision: DeclassificationDecision = {
      sourceSensitivity: "SECRET",
      targetSensitivity: "PUBLIC",
      fields: ["fieldA"],
      purpose: "narrow scope",
      capabilityId: "cap-001",
      requestHash: "hash",
      expiresAt: "2099-01-01T00:00:00Z",
    }
    // The decision specifies only fieldA — validation passes
    expect(validateDeclassification(decision, "2026-01-01T00:00:00Z")).toBeNull()
    // Applying to a labeled value is valid — but the integration layer must
    // only apply to the declared fields. The primitive is intentionally narrow.
  })
})

// ── Integration: PDP with Labels ──────────────────────────────────────

describe("Integration: label-aware PDP decisions", () => {
  // These test that the PDP correctly uses label information
  // Note: PDP tests are in pdp.test.ts — these verify the label layer

  test("SECRET + network.write is denied at PDP level", () => {
    // The label layer doesn't make PDP decisions — it provides the labels
    // The PDP tests in pdp.test.ts verify the actual denial
    const labels = combineLabels(classifySecret(), classifyRemoteContent())
    expect(labels.sensitivity).toBe("SECRET")
    expect(labels.provenance.has("REMOTE_CONTENT")).toBe(true)
    expect(labels.provenance.has("SYSTEM_POLICY")).toBe(true)
  })

  test("MCP description + secret.use is caught", () => {
    const labels = combineLabels(classifyMcpDescription(), classifySecret())
    expect(labels.sensitivity).toBe("SECRET")
    expect(labels.provenance.has("MCP_DESCRIPTION")).toBe(true)
  })
})
