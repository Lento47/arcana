import type { Database } from "bun:sqlite"
import {
  calibrateInferenceProfile,
  createLearningLabel,
  DEFAULT_RESPONSE_CALIBRATION_WEIGHTS,
  DEFAULT_LEARNING_RETENTION_DAYS,
  evaluateCalibrationProfile,
  InferenceCalibrationProfileV1Schema,
  LEARNING_CONSENT_DISCLOSURE_DIGEST,
  LEARNING_CONSENT_POLICY_VERSION,
  LearningConsentReceiptV1Schema,
  LearningExampleV1Schema,
  LearningLabelV1Schema,
  learningReference,
  profileDigest,
  type CalibrationResult,
  type InferenceCalibrationProfileV1,
  type LearningConsentAction,
  type LearningConsentReceiptV1,
  type LearningExampleV1,
  type LearningLabelV1,
  type LearningScopeType,
} from "@arcana/ml/learning"
import { randomBytes, randomUUID, createHash } from "node:crypto"
import path from "node:path"

const ACTIVATION_INTERVAL_MS = 24 * 60 * 60 * 1_000

type ConsentRow = {
  id: string
  schema_version: string
  scope_type: LearningScopeType
  scope_ref: string
  action: LearningConsentAction
  disclosure_digest: string
  retention_days: number
  source: LearningConsentReceiptV1["source"]
  created_at: string
}

type ExampleRow = {
  id: string
  payload_json: string
}

type LabelRow = {
  id: string
  payload_json: string
}

type ProfileRow = {
  id: string
  profile_digest: string
  payload_json: string
  expires_at: string
  activated_at?: string | null
}

export type EffectiveLearningConsent =
  | {
      allowed: true
      receipt: LearningConsentReceiptV1
      workspaceRef: string
      source: "workspace" | "device"
    }
  | {
      allowed: false
      workspaceRef: string
      source: "workspace" | "device" | "default"
      reason: string
    }

export type LearningStoreStatus = {
  consent: EffectiveLearningConsent
  examples: number
  labels: number
  activeProfileId: string | null
  nextExpiryAt: string | null
}

export type LearningCalibrationRun = {
  result: CalibrationResult
  storedProfileId: string | null
  activated: boolean
  activationReason: string
}

function now(): string {
  return new Date().toISOString()
}

function normalizeWorkspace(workspace: string): string {
  const resolved = path.resolve(workspace).replaceAll("\\", "/").replace(/\/+$/, "")
  return process.platform === "win32" ? resolved.toLowerCase() : resolved
}

function parseConsent(row: ConsentRow): LearningConsentReceiptV1 | null {
  const parsed = LearningConsentReceiptV1Schema.safeParse({
    schemaVersion: row.schema_version,
    id: row.id,
    scopeType: row.scope_type,
    scopeRef: row.scope_ref,
    action: row.action,
    disclosureDigest: row.disclosure_digest,
    retentionDays: row.retention_days,
    source: row.source,
    createdAt: row.created_at,
  })
  return parsed.success ? parsed.data : null
}

export class LearningStore {
  readonly #db: Database
  readonly #salt: string

  constructor(db: Database) {
    this.#db = db
    this.#salt = this.#getOrCreateSalt()
  }

  #getOrCreateSalt(): string {
    const existing = this.#db.prepare("SELECT value FROM ml_learning_metadata WHERE key = 'reference_salt'").get() as {
      value: string
    } | null
    if (existing?.value) return existing.value
    const value = randomBytes(32).toString("hex")
    this.#db.prepare("INSERT OR IGNORE INTO ml_learning_metadata (key, value) VALUES ('reference_salt', ?)").run(value)
    const stored = this.#db.prepare("SELECT value FROM ml_learning_metadata WHERE key = 'reference_salt'").get() as {
      value: string
    }
    return stored.value
  }

  reference(namespace: string, value: string): string {
    return learningReference(this.#salt, namespace, value)
  }

  workspaceReference(workspace: string): string {
    return this.reference("workspace", normalizeWorkspace(workspace))
  }

  references(input: { workspace: string; sessionId: string; messageId: string }): {
    workspaceRef: string
    sessionRef: string
    messageRef: string
  } {
    return {
      workspaceRef: this.workspaceReference(input.workspace),
      sessionRef: this.reference("session", input.sessionId),
      messageRef: this.reference("message", input.messageId),
    }
  }

  recordConsent(input: {
    scopeType: LearningScopeType
    workspace?: string
    action: LearningConsentAction
    retentionDays?: number
    source?: LearningConsentReceiptV1["source"]
    createdAt?: string
  }): LearningConsentReceiptV1 {
    if (input.scopeType === "device" && input.action === "inherit") {
      throw new Error("Device consent cannot inherit from another scope.")
    }
    if (input.scopeType === "workspace" && !input.workspace?.trim()) {
      throw new Error("Workspace consent requires a workspace path.")
    }
    const receipt = LearningConsentReceiptV1Schema.parse({
      schemaVersion: LEARNING_CONSENT_POLICY_VERSION,
      id: randomUUID(),
      scopeType: input.scopeType,
      scopeRef: input.scopeType === "device" ? "device" : this.workspaceReference(input.workspace!),
      action: input.action,
      disclosureDigest: LEARNING_CONSENT_DISCLOSURE_DIGEST,
      retentionDays: input.retentionDays ?? DEFAULT_LEARNING_RETENTION_DAYS,
      source: input.source ?? "cli",
      createdAt: input.createdAt ?? now(),
    })
    this.#db
      .prepare(
        `INSERT INTO ml_learning_consent_events
          (id, schema_version, scope_type, scope_ref, action, disclosure_digest, retention_days, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        receipt.id,
        receipt.schemaVersion,
        receipt.scopeType,
        receipt.scopeRef,
        receipt.action,
        receipt.disclosureDigest,
        receipt.retentionDays,
        receipt.source,
        receipt.createdAt,
      )
    return receipt
  }

  #latestConsentRow(scopeType: LearningScopeType, scopeRef: string): ConsentRow | null {
    return this.#db
      .prepare(
        `SELECT id, schema_version, scope_type, scope_ref, action, disclosure_digest,
                retention_days, source, created_at
         FROM ml_learning_consent_events
         WHERE scope_type = ? AND scope_ref = ?
         ORDER BY sequence DESC LIMIT 1`,
      )
      .get(scopeType, scopeRef) as ConsentRow | null
  }

  #validGrant(receipt: LearningConsentReceiptV1): boolean {
    return (
      receipt.action === "grant" &&
      receipt.schemaVersion === LEARNING_CONSENT_POLICY_VERSION &&
      receipt.disclosureDigest === LEARNING_CONSENT_DISCLOSURE_DIGEST
    )
  }

  #resolveByWorkspaceRef(workspaceRef: string): EffectiveLearningConsent {
    const workspaceRow = this.#latestConsentRow("workspace", workspaceRef)
    if (workspaceRow && workspaceRow.action !== "inherit") {
      const workspace = parseConsent(workspaceRow)
      if (workspace && this.#validGrant(workspace)) {
        return { allowed: true, receipt: workspace, workspaceRef, source: "workspace" }
      }
      return {
        allowed: false,
        workspaceRef,
        source: "workspace",
        reason: workspaceRow.action === "revoke" ? "workspace consent is revoked" : "workspace consent is stale",
      }
    }

    const deviceRow = this.#latestConsentRow("device", "device")
    const device = deviceRow ? parseConsent(deviceRow) : null
    if (device && this.#validGrant(device)) {
      return { allowed: true, receipt: device, workspaceRef, source: "device" }
    }
    return {
      allowed: false,
      workspaceRef,
      source: deviceRow ? "device" : "default",
      reason:
        deviceRow?.action === "revoke"
          ? "device consent is revoked"
          : deviceRow
            ? "device consent is stale"
            : "learning consent has not been granted",
    }
  }

  resolveConsent(workspace: string): EffectiveLearningConsent {
    return this.#resolveByWorkspaceRef(this.workspaceReference(workspace))
  }

  appendExample(workspace: string, example: LearningExampleV1): { stored: boolean; reason: string } {
    const parsed = LearningExampleV1Schema.parse(example)
    const workspaceRef = this.workspaceReference(workspace)
    return this.#db.transaction(() => {
      const consent = this.#resolveByWorkspaceRef(workspaceRef)
      if (!consent.allowed) return { stored: false, reason: consent.reason }
      const createdAt = now()
      const expiresAt = new Date(
        new Date(createdAt).getTime() + consent.receipt.retentionDays * 24 * 60 * 60 * 1_000,
      ).toISOString()
      const stored = LearningExampleV1Schema.parse({
        ...parsed,
        createdAt,
        expiresAt,
        consentReceiptId: consent.receipt.id,
        consentScopeType: consent.receipt.scopeType,
        consentScopeRef: consent.receipt.scopeRef,
        workspaceRef,
      })
      this.#db
        .prepare(
          `INSERT INTO ml_learning_examples
            (id, schema_version, consent_receipt_id, consent_scope_type, consent_scope_ref,
             workspace_ref, session_ref, message_ref, created_at, expires_at, payload_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          stored.id,
          stored.schemaVersion,
          stored.consentReceiptId,
          stored.consentScopeType,
          stored.consentScopeRef,
          stored.workspaceRef,
          stored.sessionRef,
          stored.messageRef,
          stored.createdAt,
          stored.expiresAt,
          JSON.stringify(stored),
        )
      return { stored: true, reason: "stored" }
    })()
  }

  #example(id: string): LearningExampleV1 | null {
    const row = this.#db
      .prepare("SELECT id, payload_json FROM ml_learning_examples WHERE id = ? LIMIT 1")
      .get(id) as ExampleRow | null
    if (!row) return null
    try {
      const parsed = LearningExampleV1Schema.safeParse(JSON.parse(row.payload_json))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }

  appendLabel(
    exampleId: string,
    input: Omit<LearningLabelV1, "schemaVersion" | "id" | "exampleId" | "createdAt"> & {
      id?: string
      createdAt?: string
    },
  ): { stored: boolean; reason: string; label?: LearningLabelV1 } {
    return this.#db.transaction(() => {
      const example = this.#example(exampleId)
      if (!example) return { stored: false, reason: "learning example not found" }
      const consent = this.#resolveByWorkspaceRef(example.workspaceRef)
      if (!consent.allowed) return { stored: false, reason: consent.reason }
      const label = createLearningLabel({ ...input, exampleId })
      this.#db
        .prepare(
          `INSERT INTO ml_learning_labels (id, example_id, kind, source, created_at, payload_json)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(label.id, label.exampleId, label.kind, label.source, label.createdAt, JSON.stringify(label))
      return { stored: true, reason: "stored", label }
    })()
  }

  appendRatingForMessage(
    messageId: string,
    rating: "up" | "down",
    createdAt?: string,
  ): { stored: boolean; reason: string; label?: LearningLabelV1 } {
    const messageRef = this.reference("message", messageId)
    const row = this.#db
      .prepare(
        `SELECT id, payload_json FROM ml_learning_examples
         WHERE message_ref = ? ORDER BY created_at DESC LIMIT 1`,
      )
      .get(messageRef) as ExampleRow | null
    if (!row) return { stored: false, reason: "no consented learning example matches this message" }
    const result = this.appendLabel(row.id, {
      kind: "response_rating",
      value: rating === "up" ? "positive" : "negative",
      source: "explicit_user",
      confidence: 1,
      provenance: "USER_INSTRUCTION",
      createdAt,
    })
    if (result.stored) {
      const example = this.#example(row.id)
      if (example) {
        const rollback = this.#maybeRollbackByWorkspaceRef(example.workspaceRef)
        if (!rollback.rolledBack) this.#calibrateByWorkspaceRef(example.workspaceRef)
      }
    }
    return result
  }

  listExamples(
    input: {
      scopeType?: LearningScopeType
      scopeRef?: string
      workspaceRef?: string
      limit?: number
      includeExpired?: boolean
    } = {},
  ): LearningExampleV1[] {
    const clauses: string[] = []
    const bindings: Array<string | number> = []
    if (input.scopeType) {
      clauses.push("consent_scope_type = ?")
      bindings.push(input.scopeType)
    }
    if (input.scopeRef) {
      clauses.push("consent_scope_ref = ?")
      bindings.push(input.scopeRef)
    }
    if (input.workspaceRef) {
      clauses.push("workspace_ref = ?")
      bindings.push(input.workspaceRef)
    }
    if (!input.includeExpired) {
      clauses.push("expires_at > ?")
      bindings.push(now())
    }
    const limit = Math.max(1, Math.min(100_000, Math.floor(input.limit ?? 10_000)))
    bindings.push(limit)
    const rows = this.#db
      .prepare(
        `SELECT id, payload_json FROM ml_learning_examples
         ${clauses.length ? `WHERE ${clauses.join(" AND ")}` : ""}
         ORDER BY created_at ASC LIMIT ?`,
      )
      .all(...bindings) as ExampleRow[]
    return rows.flatMap((row) => {
      try {
        const parsed = LearningExampleV1Schema.safeParse(JSON.parse(row.payload_json))
        return parsed.success ? [parsed.data] : []
      } catch {
        return []
      }
    })
  }

  listLabels(exampleIds?: string[]): LearningLabelV1[] {
    if (exampleIds?.length === 0) return []
    const rows = exampleIds
      ? (this.#db
          .prepare(
            `SELECT id, payload_json FROM ml_learning_labels
             WHERE example_id IN (${exampleIds.map(() => "?").join(",")})
             ORDER BY created_at ASC`,
          )
          .all(...exampleIds) as LabelRow[])
      : (this.#db
          .prepare("SELECT id, payload_json FROM ml_learning_labels ORDER BY created_at ASC")
          .all() as LabelRow[])
    return rows.flatMap((row) => {
      try {
        const parsed = LearningLabelV1Schema.safeParse(JSON.parse(row.payload_json))
        return parsed.success ? [parsed.data] : []
      } catch {
        return []
      }
    })
  }

  #putCandidate(profile: InferenceCalibrationProfileV1, exampleIds: string[]): void {
    const parsed = InferenceCalibrationProfileV1Schema.parse(profile)
    this.#db.transaction(() => {
      this.#db
        .prepare(
          `INSERT OR REPLACE INTO ml_learning_profiles
            (id, schema_version, scope_type, scope_ref, status, profile_digest, created_at, activated_at, expires_at, payload_json)
           VALUES (?, ?, ?, ?, 'candidate', ?, ?, NULL, ?, ?)`,
        )
        .run(
          parsed.id,
          parsed.schemaVersion,
          parsed.scopeType,
          parsed.scopeRef,
          profileDigest(parsed),
          parsed.createdAt,
          parsed.expiresAt,
          JSON.stringify(parsed),
        )
      const link = this.#db.prepare(
        "INSERT OR IGNORE INTO ml_learning_profile_examples (profile_id, example_id) VALUES (?, ?)",
      )
      for (const exampleId of exampleIds) link.run(parsed.id, exampleId)
    })()
  }

  #scopeHasCurrentGrant(scopeType: LearningScopeType, scopeRef: string): boolean {
    const row = this.#latestConsentRow(scopeType, scopeRef)
    const receipt = row ? parseConsent(row) : null
    return receipt ? this.#validGrant(receipt) : false
  }

  activateProfile(profileId: string, reason: string, at = now()): { activated: boolean; reason: string } {
    return this.#db.transaction(() => {
      const row = this.#db
        .prepare(
          `SELECT id, profile_digest, payload_json, expires_at
           FROM ml_learning_profiles WHERE id = ? AND status = 'candidate' LIMIT 1`,
        )
        .get(profileId) as ProfileRow | null
      if (!row) return { activated: false, reason: "candidate profile not found" }
      const parsed = InferenceCalibrationProfileV1Schema.safeParse(JSON.parse(row.payload_json))
      if (!parsed.success || profileDigest(parsed.data) !== row.profile_digest) {
        return { activated: false, reason: "candidate profile failed integrity validation" }
      }
      const profile = parsed.data
      if (new Date(profile.expiresAt).getTime() <= new Date(at).getTime()) {
        return { activated: false, reason: "candidate profile is expired" }
      }
      if (!this.#scopeHasCurrentGrant(profile.scopeType, profile.scopeRef)) {
        return { activated: false, reason: "scope no longer has current consent" }
      }
      const last = this.#db
        .prepare(
          `SELECT created_at FROM ml_learning_activation_events
           WHERE scope_type = ? AND scope_ref = ? AND action = 'activate'
           ORDER BY sequence DESC LIMIT 1`,
        )
        .get(profile.scopeType, profile.scopeRef) as { created_at: string } | null
      if (last && new Date(at).getTime() - new Date(last.created_at).getTime() < ACTIVATION_INTERVAL_MS) {
        return { activated: false, reason: "scope activation is limited to once per 24 hours" }
      }
      this.#db
        .prepare(
          `UPDATE ml_learning_profiles SET status = 'retired'
           WHERE scope_type = ? AND scope_ref = ? AND status = 'active'`,
        )
        .run(profile.scopeType, profile.scopeRef)
      this.#db
        .prepare("UPDATE ml_learning_profiles SET status = 'active', activated_at = ? WHERE id = ?")
        .run(at, profile.id)
      this.#db
        .prepare(
          `INSERT INTO ml_learning_activation_events
            (id, scope_type, scope_ref, profile_id, action, reason, created_at)
           VALUES (?, ?, ?, ?, 'activate', ?, ?)`,
        )
        .run(randomUUID(), profile.scopeType, profile.scopeRef, profile.id, reason, at)
      return { activated: true, reason: "activated" }
    })()
  }

  #calibrateByWorkspaceRef(workspaceRef: string, at = now()): LearningCalibrationRun {
    this.applyRetention(at)
    const consent = this.#resolveByWorkspaceRef(workspaceRef)
    if (!consent.allowed) {
      return {
        result: { eligible: false, reasons: [consent.reason] },
        storedProfileId: null,
        activated: false,
        activationReason: consent.reason,
      }
    }
    const examples = this.listExamples({
      scopeType: consent.receipt.scopeType,
      scopeRef: consent.receipt.scopeRef,
      limit: 100_000,
    })
    const labels = this.listLabels(examples.map((example) => example.id))
    const result = calibrateInferenceProfile({
      examples,
      labels,
      scopeType: consent.receipt.scopeType,
      scopeRef: consent.receipt.scopeRef,
      now: at,
    })
    if (!result.eligible) {
      return { result, storedProfileId: null, activated: false, activationReason: result.reasons.join("; ") }
    }
    const existing = this.#db
      .prepare("SELECT status FROM ml_learning_profiles WHERE id = ? LIMIT 1")
      .get(result.profile.id) as { status: string } | null
    if (existing?.status === "active") {
      return {
        result,
        storedProfileId: result.profile.id,
        activated: false,
        activationReason: "equivalent calibration profile is already active",
      }
    }
    this.#putCandidate(
      result.profile,
      examples.map((example) => example.id),
    )
    if (!result.activate) {
      return {
        result,
        storedProfileId: result.profile.id,
        activated: false,
        activationReason: result.reasons.join("; "),
      }
    }
    const activation = this.activateProfile(result.profile.id, "automatic calibration gates passed", at)
    return {
      result,
      storedProfileId: result.profile.id,
      activated: activation.activated,
      activationReason: activation.reason,
    }
  }

  calibrateAndMaybeActivate(workspace: string, at = now()): LearningCalibrationRun {
    return this.#calibrateByWorkspaceRef(this.workspaceReference(workspace), at)
  }

  #maybeRollbackByWorkspaceRef(
    workspaceRef: string,
    at = now(),
  ): { evaluated: boolean; rolledBack: boolean; reason: string } {
    const consent = this.#resolveByWorkspaceRef(workspaceRef)
    if (!consent.allowed) return { evaluated: false, rolledBack: false, reason: consent.reason }
    const row = this.#db
      .prepare(
        `SELECT id, profile_digest, payload_json, expires_at, activated_at
         FROM ml_learning_profiles
         WHERE scope_type = ? AND scope_ref = ? AND status = 'active' AND expires_at > ?
         ORDER BY activated_at DESC LIMIT 1`,
      )
      .get(consent.receipt.scopeType, consent.receipt.scopeRef, at) as ProfileRow | null
    if (!row?.activated_at) return { evaluated: false, rolledBack: false, reason: "no active profile" }
    let profile: InferenceCalibrationProfileV1
    try {
      const parsed = InferenceCalibrationProfileV1Schema.safeParse(JSON.parse(row.payload_json))
      if (!parsed.success || profileDigest(parsed.data) !== row.profile_digest) {
        return { evaluated: false, rolledBack: false, reason: "active profile failed integrity validation" }
      }
      profile = parsed.data
    } catch {
      return { evaluated: false, rolledBack: false, reason: "active profile failed integrity validation" }
    }
    const examples = this.listExamples({
      scopeType: profile.scopeType,
      scopeRef: profile.scopeRef,
      limit: 100_000,
    })
    const labels = this.listLabels(examples.map((example) => example.id)).filter(
      (label) => label.createdAt > row.activated_at!,
    )
    const labeledExampleIds = new Set(labels.map((label) => label.exampleId))
    const labeledExamples = examples.filter((example) => labeledExampleIds.has(example.id))
    const candidate = evaluateCalibrationProfile({
      examples: labeledExamples,
      labels,
      weights: profile.response.weights,
      threshold: profile.response.threshold,
    })
    if (candidate.examples < 20 || candidate.positives < 5 || candidate.negatives < 5) {
      return {
        evaluated: false,
        rolledBack: false,
        reason: `rollback evaluation requires 20 labels and five per class; found ${candidate.examples}`,
      }
    }
    const baseline = evaluateCalibrationProfile({
      examples: labeledExamples,
      labels,
      weights: DEFAULT_RESPONSE_CALIBRATION_WEIGHTS,
      threshold: 0.64,
    })
    const regressed =
      candidate.balancedAccuracy < baseline.balancedAccuracy - 0.01 ||
      candidate.logLoss > baseline.logLoss ||
      candidate.falseAllows > baseline.falseAllows ||
      candidate.falseRevisionRate > baseline.falseRevisionRate + 0.01
    if (!regressed) return { evaluated: true, rolledBack: false, reason: "active profile remains healthy" }
    this.#db.transaction(() => {
      this.#db.prepare("UPDATE ml_learning_profiles SET status = 'rolled_back' WHERE id = ?").run(profile.id)
      this.#db
        .prepare(
          `INSERT INTO ml_learning_activation_events
            (id, scope_type, scope_ref, profile_id, action, reason, created_at)
           VALUES (?, ?, ?, ?, 'rollback', ?, ?)`,
        )
        .run(
          randomUUID(),
          profile.scopeType,
          profile.scopeRef,
          profile.id,
          "post-activation authoritative labels regressed against baseline",
          at,
        )
    })()
    return { evaluated: true, rolledBack: true, reason: "rolled back to baseline after regression" }
  }

  getActiveProfile(workspace: string, at = now()): InferenceCalibrationProfileV1 | null {
    this.applyRetention(at)
    const consent = this.resolveConsent(workspace)
    if (!consent.allowed) return null
    const scopes: Array<{ type: LearningScopeType; ref: string }> = []
    if (consent.source === "workspace") {
      scopes.push({ type: "workspace", ref: consent.receipt.scopeRef })
      if (this.#scopeHasCurrentGrant("device", "device")) scopes.push({ type: "device", ref: "device" })
    } else {
      scopes.push({ type: "device", ref: "device" })
    }
    for (const scope of scopes) {
      const row = this.#db
        .prepare(
          `SELECT id, profile_digest, payload_json, expires_at
           FROM ml_learning_profiles
           WHERE scope_type = ? AND scope_ref = ? AND status = 'active' AND expires_at > ?
           ORDER BY activated_at DESC LIMIT 1`,
        )
        .get(scope.type, scope.ref, at) as ProfileRow | null
      if (!row) continue
      try {
        const parsed = InferenceCalibrationProfileV1Schema.safeParse(JSON.parse(row.payload_json))
        if (parsed.success && profileDigest(parsed.data) === row.profile_digest) return parsed.data
      } catch {
        // A corrupt profile is ignored; the baseline remains the fail-safe.
      }
    }
    return null
  }

  applyRetention(at = now()): { expiredExamples: number; invalidatedProfiles: number } {
    return this.#db.transaction(() => {
      const expired = this.#db.prepare("SELECT id FROM ml_learning_examples WHERE expires_at <= ?").all(at) as Array<{
        id: string
      }>
      if (!expired.length) return { expiredExamples: 0, invalidatedProfiles: 0 }
      const placeholders = expired.map(() => "?").join(",")
      const profiles = this.#db
        .prepare(
          `SELECT DISTINCT profile_id FROM ml_learning_profile_examples
           WHERE example_id IN (${placeholders})`,
        )
        .all(...expired.map((item) => item.id)) as Array<{ profile_id: string }>
      const update = this.#db.prepare(
        "UPDATE ml_learning_profiles SET status = 'invalidated' WHERE id = ? AND status IN ('candidate', 'active')",
      )
      const event = this.#db.prepare(
        `INSERT INTO ml_learning_activation_events
          (id, scope_type, scope_ref, profile_id, action, reason, created_at)
         SELECT ?, scope_type, scope_ref, id, 'invalidate', ?, ? FROM ml_learning_profiles WHERE id = ?`,
      )
      let invalidatedProfiles = 0
      for (const profile of profiles) {
        const result = update.run(profile.profile_id)
        if (result.changes > 0) {
          invalidatedProfiles += 1
          event.run(randomUUID(), "source learning example expired", at, profile.profile_id)
        }
      }
      this.#db
        .prepare(`DELETE FROM ml_learning_examples WHERE id IN (${placeholders})`)
        .run(...expired.map((item) => item.id))
      return { expiredExamples: expired.length, invalidatedProfiles }
    })()
  }

  purge(input: { scopeType: LearningScopeType; workspace?: string }): {
    examples: number
    profiles: number
  } {
    if (input.scopeType === "workspace" && !input.workspace?.trim()) {
      throw new Error("Workspace purge requires a workspace path.")
    }
    const scopeRef = input.scopeType === "device" ? "device" : this.workspaceReference(input.workspace!)
    return this.#db.transaction(() => {
      const exampleRows =
        input.scopeType === "device"
          ? (this.#db
              .prepare(
                "SELECT id FROM ml_learning_examples WHERE consent_scope_type = 'device' AND consent_scope_ref = ?",
              )
              .all(scopeRef) as Array<{ id: string }>)
          : (this.#db.prepare("SELECT id FROM ml_learning_examples WHERE workspace_ref = ?").all(scopeRef) as Array<{
              id: string
            }>)
      const linkedProfileRows = exampleRows.length
        ? (this.#db
            .prepare(
              `SELECT DISTINCT profile_id AS id FROM ml_learning_profile_examples
               WHERE example_id IN (${exampleRows.map(() => "?").join(",")})`,
            )
            .all(...exampleRows.map((row) => row.id)) as Array<{ id: string }>)
        : []
      const scopedProfileRows = this.#db
        .prepare("SELECT id FROM ml_learning_profiles WHERE scope_type = ? AND scope_ref = ?")
        .all(input.scopeType, scopeRef) as Array<{ id: string }>
      const profileRows = [
        ...new Map([...linkedProfileRows, ...scopedProfileRows].map((profile) => [profile.id, profile])).values(),
      ]
      for (const profile of profileRows) {
        this.#db.prepare("DELETE FROM ml_learning_profiles WHERE id = ?").run(profile.id)
      }
      for (const example of exampleRows) {
        this.#db.prepare("DELETE FROM ml_learning_examples WHERE id = ?").run(example.id)
      }
      return { examples: exampleRows.length, profiles: profileRows.length }
    })()
  }

  status(workspace: string): LearningStoreStatus {
    const consent = this.resolveConsent(workspace)
    const workspaceRef = consent.workspaceRef
    const counts = this.#db
      .prepare(
        `SELECT COUNT(*) AS examples,
                MIN(expires_at) AS next_expiry_at,
                (SELECT COUNT(*) FROM ml_learning_labels l
                 JOIN ml_learning_examples e2 ON e2.id = l.example_id
                 WHERE e2.workspace_ref = ?) AS labels
         FROM ml_learning_examples WHERE workspace_ref = ?`,
      )
      .get(workspaceRef, workspaceRef) as { examples: number; labels: number; next_expiry_at: string | null }
    return {
      consent,
      examples: counts.examples,
      labels: counts.labels,
      activeProfileId: this.getActiveProfile(workspace)?.id ?? null,
      nextExpiryAt: counts.next_expiry_at,
    }
  }

  recordExport(input: {
    scopeType?: LearningScopeType
    scopeRef?: string
    includeContent: boolean
    exampleCount: number
    labelCount: number
    destination: string
    jsonlSha256: string
    manifestSha256: string
    createdAt?: string
  }): string {
    const id = randomUUID()
    const destinationDigest = createHash("sha256").update(input.destination, "utf8").digest("hex")
    this.#db
      .prepare(
        `INSERT INTO ml_learning_exports
          (id, scope_type, scope_ref, include_content, example_count, label_count,
           destination_digest, jsonl_sha256, manifest_sha256, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.scopeType ?? null,
        input.scopeRef ?? null,
        input.includeContent ? 1 : 0,
        input.exampleCount,
        input.labelCount,
        destinationDigest,
        input.jsonlSha256,
        input.manifestSha256,
        input.createdAt ?? now(),
      )
    return id
  }
}
