import { describe, expect, test } from "bun:test"

import {
  calibrateInferenceProfile,
  createLearningLabel,
  LEARNING_SCHEMA_VERSION,
  LearningExampleV1Schema,
  redactLearningText,
  type LearningExampleV1,
  type LearningQualityFeaturesV1,
} from "./learning.js"

function quality(positive: boolean): LearningQualityFeaturesV1 {
  return {
    score: positive ? 0.8 : 0.3,
    genericity: positive ? 0 : 1,
    specificity: 0.4,
    actionability: 0.4,
    constraintFit: 0.4,
    contractCoverage: 0.4,
    evidenceGap: false,
  }
}

function example(index: number, positive: boolean): LearningExampleV1 {
  const createdAt = new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString()
  const text = redactLearningText(positive ? "Concrete response" : "Generic response")
  return LearningExampleV1Schema.parse({
    schemaVersion: LEARNING_SCHEMA_VERSION,
    id: `example-${index}`,
    createdAt,
    expiresAt: new Date(Date.UTC(2026, 9, 1)).toISOString(),
    consentReceiptId: "consent-1",
    consentScopeType: "workspace",
    consentScopeRef: "workspace-ref",
    workspaceRef: "workspace-ref",
    sessionRef: `session-${index}`,
    messageRef: `message-${index}`,
    runtime: "engine",
    optimizerMode: "optimize",
    phase: "final",
    intent: "code_edit",
    model: { provider: "fixture", model: "fixture-model" },
    profileId: null,
    request: redactLearningText("Implement the token optimizer"),
    draftResponse: null,
    finalResponse: text,
    preparation: {
      status: "ready",
      candidateContextTokens: 1_000,
      packedContextTokens: 500,
      tokenSavings: 500,
      tokenSavingsRatio: 0.5,
      availableInputTokens: 8_000,
      outputReserveTokens: 4_096,
      toolReserveTokens: 0,
      context: [],
    },
    response: {
      initial: quality(positive),
      final: quality(positive),
      disposition: positive ? "respond" : "reject",
      revisions: 0,
    },
    usage: {
      inputTokens: 800,
      outputTokens: positive ? 700 : 200,
      toolTokens: 0,
      latencyMilliseconds: 20,
    },
    evidenceTypes: [],
  })
}

describe("learning data contracts", () => {
  test("redacts secrets, PII, and absolute paths before persistence", () => {
    const result = redactLearningText(
      "Authorization: Bearer abcdefghijklmnopqrstuvwxyz user@example.com 192.168.1.10 C:\\Users\\alice\\repo\\secret.ts",
    )

    expect(result.content).not.toContain("abcdefghijklmnopqrstuvwxyz")
    expect(result.content).not.toContain("user@example.com")
    expect(result.content).not.toContain("192.168.1.10")
    expect(result.content).not.toContain("alice")
    expect(result.redactions.secret).toBe(1)
    expect(result.redactions.email).toBe(1)
    expect(result.redactions.ip_address).toBe(1)
    expect(result.redactions.absolute_path).toBe(1)
  })

  test("omits content explicitly classified SECRET", () => {
    const result = redactLearningText("must never persist", { sensitivity: "SECRET" })

    expect(result.content).toBeNull()
    expect(result.retainedCharacters).toBe(0)
    expect(result.redactions.secret_sensitivity).toBe(1)
  })

  test("bounds retained content after redaction", () => {
    const result = redactLearningText("x".repeat(100), { maxCharacters: 12 })

    expect(result.content).toBe("x".repeat(12))
    expect(result.truncated).toBe(true)
    expect(result.redactions.truncated).toBe(1)
  })

  test("does not calibrate without authoritative sample gates", () => {
    const examples = Array.from({ length: 10 }, (_, index) => example(index, index % 2 === 0))
    const labels = examples.map((item, index) =>
      createLearningLabel({
        exampleId: item.id,
        kind: "response_rating",
        value: index % 2 === 0 ? "positive" : "negative",
        source: "explicit_user",
        confidence: 1,
        provenance: "USER_INSTRUCTION",
      }),
    )
    const result = calibrateInferenceProfile({
      examples,
      labels,
      scopeType: "workspace",
      scopeRef: "workspace-ref",
    })

    expect(result.eligible).toBe(false)
    if (!result.eligible) expect(result.reasons.join(" ")).toContain("requires 50")
  })

  test("creates an activatable deterministic profile only after holdout improvement", () => {
    const examples = Array.from({ length: 240 }, (_, index) => example(index, index % 2 === 0))
    const labels = examples.map((item, index) =>
      createLearningLabel({
        exampleId: item.id,
        kind: "response_rating",
        value: index % 2 === 0 ? "positive" : "negative",
        source: "explicit_user",
        confidence: 1,
        provenance: "USER_INSTRUCTION",
        createdAt: item.createdAt,
      }),
    )
    const first = calibrateInferenceProfile({
      examples,
      labels,
      scopeType: "workspace",
      scopeRef: "workspace-ref",
      now: "2026-08-20T00:00:00.000Z",
    })
    const second = calibrateInferenceProfile({
      examples,
      labels,
      scopeType: "workspace",
      scopeRef: "workspace-ref",
      now: "2026-08-20T00:00:00.000Z",
    })

    expect(first.eligible).toBe(true)
    if (!first.eligible || !second.eligible) return
    expect(first.activate).toBe(true)
    expect(first.profile).toEqual(second.profile)
    expect(first.profile.response.weights.nonGenericity).toBeGreaterThan(0.7)
    expect(first.profile.tokenReserves).toContainEqual(
      expect.objectContaining({ phase: "final", tools: false, samples: 120 }),
    )
  })

  test("derived labels alone cannot train an active profile", () => {
    const examples = Array.from({ length: 60 }, (_, index) => example(index, index % 2 === 0))
    const labels = examples.map((item, index) =>
      createLearningLabel({
        exampleId: item.id,
        kind: "revision_outcome",
        value: index % 2 === 0 ? "improved" : "not_improved",
        source: "deterministic_derived",
        confidence: 0.5,
        provenance: "MODEL_OUTPUT",
      }),
    )
    const result = calibrateInferenceProfile({
      examples,
      labels,
      scopeType: "workspace",
      scopeRef: "workspace-ref",
    })

    expect(result.eligible).toBe(false)
  })
})
