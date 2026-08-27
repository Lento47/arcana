import { describe, expect, test } from "bun:test"
import type { Database } from "bun:sqlite"
import {
  LEARNING_CONSENT_DISCLOSURE_DIGEST,
  LEARNING_SCHEMA_VERSION,
  redactLearningText,
  type LearningExampleV1,
} from "@arcana/ml/learning"
import { existsSync, mkdirSync, readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import { tmpdir } from "node:os"
import path from "node:path"

import { openMemoryDB } from "../src/db.js"
import { exportLearningDataset } from "../src/learning-export.js"
import { runLearningDataCommand } from "../src/learning-command.js"
import { LearningStore } from "../src/learning-store.js"
import { MemoryStore } from "../src/store.js"

function fresh(): { db: Database; store: LearningStore; workspace: string; dir: string } {
  const dir = path.join(tmpdir(), `arcana-learning-${Date.now()}-${Math.random().toString(36).slice(2)}`)
  mkdirSync(dir, { recursive: true })
  const db = openMemoryDB(dir)
  return { db, store: new LearningStore(db), workspace: path.join(dir, "workspace"), dir }
}

function example(store: LearningStore, workspace: string, messageId = "message-1"): LearningExampleV1 {
  const refs = store.references({ workspace, sessionId: "session-1", messageId })
  const quality = {
    score: 0.8,
    genericity: 0.1,
    specificity: 0.8,
    actionability: 0.8,
    constraintFit: 0.8,
    contractCoverage: 0.8,
    evidenceGap: false,
  }
  return {
    schemaVersion: LEARNING_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    consentReceiptId: "replaced-by-store",
    consentScopeType: "device",
    consentScopeRef: "device",
    ...refs,
    runtime: "engine",
    optimizerMode: "optimize",
    phase: "final",
    intent: "implementation",
    model: { provider: "test", model: "test-model" },
    profileId: null,
    request: redactLearningText("Fix C:\\Users\\alice\\secret.ts for alice@example.com"),
    draftResponse: null,
    finalResponse: redactLearningText("Implemented the focused fix."),
    preparation: {
      status: "ready",
      candidateContextTokens: 100,
      packedContextTokens: 80,
      tokenSavings: 20,
      tokenSavingsRatio: 0.2,
      availableInputTokens: 4_000,
      outputReserveTokens: 1_000,
      toolReserveTokens: 0,
      context: [],
    },
    response: { initial: quality, final: quality, disposition: "respond", revisions: 0 },
    usage: { inputTokens: 100, outputTokens: 40, toolTokens: 0, latencyMilliseconds: 12 },
    evidenceTypes: ["test"],
  }
}

describe("LearningStore consent and persistence", () => {
  test("requires an affirmative acknowledgement before granting consent", () => {
    const { store, workspace } = fresh()
    const preview = runLearningDataCommand(store, workspace, {
      action: ["consent", "grant"],
      scope: "workspace",
    })
    expect(preview.exitCode).toBe(1)
    expect(preview.output.join(" ")).toContain("never upload")
    expect(store.resolveConsent(workspace).allowed).toBeFalse()

    const granted = runLearningDataCommand(store, workspace, {
      action: ["consent", "grant"],
      scope: "workspace",
      yes: true,
      source: "tui",
    })
    expect(granted.exitCode).toBe(0)
    const consent = store.resolveConsent(workspace)
    expect(consent.allowed).toBeTrue()
    if (consent.allowed) expect(consent.receipt.source).toBe("tui")
  })

  test("defaults denied and does not backfill records created before consent", () => {
    const { store, workspace } = fresh()
    expect(store.resolveConsent(workspace).allowed).toBeFalse()
    expect(store.appendExample(workspace, example(store, workspace)).stored).toBeFalse()

    store.recordConsent({ scopeType: "device", action: "grant", source: "test" })
    expect(store.listExamples({ includeExpired: true })).toHaveLength(0)
    expect(store.appendExample(workspace, example(store, workspace)).stored).toBeTrue()
    expect(store.listExamples()).toHaveLength(1)
  })

  test("workspace revoke wins over device grant and inherit restores device policy", () => {
    const { store, workspace } = fresh()
    store.recordConsent({ scopeType: "device", action: "grant", source: "test" })
    expect(store.resolveConsent(workspace).allowed).toBeTrue()

    store.recordConsent({ scopeType: "workspace", workspace, action: "revoke", source: "test" })
    expect(store.resolveConsent(workspace).allowed).toBeFalse()

    store.recordConsent({ scopeType: "workspace", workspace, action: "inherit", source: "test" })
    const inherited = store.resolveConsent(workspace)
    expect(inherited.allowed).toBeTrue()
    if (inherited.allowed) expect(inherited.source).toBe("device")
  })

  test("fails closed when the current disclosure digest is stale", () => {
    const { db, store, workspace } = fresh()
    store.recordConsent({ scopeType: "device", action: "grant", source: "test" })
    db.prepare("UPDATE ml_learning_consent_events SET disclosure_digest = ?").run("0".repeat(64))
    const consent = store.resolveConsent(workspace)
    expect(consent.allowed).toBeFalse()
    if (!consent.allowed) expect(consent.reason).toContain("stale")
    expect(LEARNING_CONSENT_DISCLOSURE_DIGEST).not.toBe("0".repeat(64))
  })

  test("turns existing explicit feedback into authoritative labels only after capture", () => {
    const { db, store, workspace } = fresh()
    store.recordConsent({ scopeType: "device", action: "grant", source: "test" })
    store.appendExample(workspace, example(store, workspace, "rated-message"))

    new MemoryStore(db).recordFeedback({ messageId: "rated-message", rating: "down", source: "test" })
    const labels = store.listLabels()
    expect(labels).toHaveLength(1)
    expect(labels[0]).toMatchObject({
      kind: "response_rating",
      value: "negative",
      source: "explicit_user",
      provenance: "USER_INSTRUCTION",
    })
  })

  test("revocation stops new labels and profile use without deleting retained examples", () => {
    const { db, store, workspace } = fresh()
    store.recordConsent({ scopeType: "device", action: "grant", source: "test" })
    store.appendExample(workspace, example(store, workspace, "rated-message"))
    store.recordConsent({ scopeType: "device", action: "revoke", source: "test" })

    new MemoryStore(db).recordFeedback({ messageId: "rated-message", rating: "up", source: "test" })
    expect(store.listLabels()).toHaveLength(0)
    expect(store.listExamples()).toHaveLength(1)
    expect(store.getActiveProfile(workspace)).toBeNull()
  })

  test("activates a gated profile without demoting it on an equivalent calibration run", () => {
    const { store, workspace } = fresh()
    store.recordConsent({ scopeType: "workspace", workspace, action: "grant", source: "test" })
    for (let index = 0; index < 240; index++) {
      const positive = index % 2 === 0
      const item = example(store, workspace, `calibration-message-${index}`)
      item.sessionRef = store.reference("session", `calibration-session-${index}`)
      item.response.initial = item.response.final = {
        score: positive ? 0.8 : 0.3,
        genericity: positive ? 0 : 1,
        specificity: 0.4,
        actionability: 0.4,
        constraintFit: 0.4,
        contractCoverage: 0.4,
        evidenceGap: false,
      }
      item.response.disposition = positive ? "respond" : "reject"
      expect(store.appendExample(workspace, item).stored).toBeTrue()
      expect(
        store.appendLabel(item.id, {
          kind: "response_rating",
          value: positive ? "positive" : "negative",
          source: "explicit_user",
          confidence: 1,
          provenance: "USER_INSTRUCTION",
        }).stored,
      ).toBeTrue()
    }
    const regressionMessages: string[] = []
    for (let index = 0; index < 20; index++) {
      const positive = index % 2 === 0
      const messageId = `post-activation-message-${index}`
      regressionMessages.push(messageId)
      const item = example(store, workspace, messageId)
      item.sessionRef = store.reference("session", `post-activation-session-${index}`)
      item.response.initial = item.response.final = {
        score: positive ? 0.8 : 0.3,
        // Deliberately opposes the learned non-genericity-heavy profile while
        // the baseline remains correct, exercising automatic rollback.
        genericity: positive ? 1 : 0,
        specificity: positive ? 1 : 0,
        actionability: positive ? 1 : 0,
        constraintFit: positive ? 1 : 0,
        contractCoverage: positive ? 1 : 0,
        evidenceGap: false,
      }
      expect(store.appendExample(workspace, item).stored).toBeTrue()
    }
    const at = new Date(Date.now() - 1_000).toISOString()
    const first = store.calibrateAndMaybeActivate(workspace, at)
    expect(first.activated).toBeTrue()
    expect(store.getActiveProfile(workspace)?.id).toBe(first.storedProfileId)

    const equivalent = store.calibrateAndMaybeActivate(workspace, at)
    expect(equivalent.activated).toBeFalse()
    expect(equivalent.activationReason).toContain("already active")
    expect(store.getActiveProfile(workspace)?.id).toBe(first.storedProfileId)

    for (let index = 0; index < regressionMessages.length; index++) {
      const labeled = store.appendRatingForMessage(regressionMessages[index]!, index % 2 === 0 ? "up" : "down")
      expect(labeled.stored).toBeTrue()
    }
    expect(store.getActiveProfile(workspace)).toBeNull()
  })
})

describe("learning dataset export", () => {
  test("exports structured-only data with per-export identifiers and no text", () => {
    const { store, workspace, dir } = fresh()
    store.recordConsent({ scopeType: "device", action: "grant", source: "test" })
    store.appendExample(workspace, example(store, workspace))
    const output = path.join(dir, "dataset.jsonl")

    const result = exportLearningDataset(store, { output })
    const line = JSON.parse(readFileSync(output, "utf8").trim()) as {
      type: string
      data: LearningExampleV1
    }
    const internal = store.listExamples()[0]!
    expect(result.data).toMatchObject({ exampleCount: 1, labelCount: 0, includeContent: false })
    expect(line.type).toBe("example")
    expect(line.data.id).not.toBe(internal.id)
    expect(line.data.request.content).toBeNull()
    expect(line.data.finalResponse.content).toBeNull()
    expect(line.data.request.digest).not.toBe(internal.request.digest)
    expect(existsSync(result.manifest)).toBeTrue()
    expect(createHash("sha256").update(readFileSync(output)).digest("hex")).toBe(result.data.jsonlSha256)
    expect(() => exportLearningDataset(store, { output })).toThrow("refusing to overwrite")
  })

  test("requires explicit private-data acknowledgement for redacted content", () => {
    const { store, workspace, dir } = fresh()
    store.recordConsent({ scopeType: "device", action: "grant", source: "test" })
    store.appendExample(workspace, example(store, workspace))
    expect(() =>
      exportLearningDataset(store, { output: path.join(dir, "unsafe.jsonl"), includeContent: true }),
    ).toThrow("--acknowledge-private-data")

    const result = exportLearningDataset(store, {
      output: path.join(dir, "acknowledged.jsonl"),
      includeContent: true,
      acknowledgePrivateData: true,
    })
    const line = JSON.parse(readFileSync(result.output, "utf8").trim()) as { data: LearningExampleV1 }
    expect(line.data.request.content).toContain("<ABSOLUTE_PATH_REDACTED>")
    expect(line.data.request.content).toContain("<EMAIL_REDACTED>")
    expect(line.data.request.content).not.toContain("alice@example.com")
  })
})
