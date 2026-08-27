import {
  DEFAULT_LEARNING_RETENTION_DAYS,
  LEARNING_CONSENT_DISCLOSURE,
  LEARNING_CONSENT_POLICY_VERSION,
  type LearningScopeType,
  type LearningConsentReceiptV1,
} from "@arcana/ml/learning"

import { exportLearningDataset } from "./learning-export.js"
import { LearningStore } from "./learning-store.js"

export type LearningDataCommandInput = {
  action?: string[]
  scope?: LearningScopeType
  retentionDays?: number
  yes?: boolean
  output?: string
  includeContent?: boolean
  acknowledgePrivateData?: boolean
  positive?: boolean
  negative?: boolean
  limit?: number
  source?: LearningConsentReceiptV1["source"]
}

export type LearningDataCommandResult = {
  output: string[]
  errors: string[]
  exitCode: number
}

function result(output: string[] = [], errors: string[] = []): LearningDataCommandResult {
  return { output, errors, exitCode: errors.length ? 1 : 0 }
}

export function runLearningDataCommand(
  store: LearningStore,
  workspace: string,
  input: LearningDataCommandInput,
): LearningDataCommandResult {
  const parts = input.action ?? []
  const action = (parts[0] ?? "status").toLowerCase()
  if (action === "status") {
    store.applyRetention()
    const status = store.status(workspace)
    return result([
      `Consent: ${status.consent.allowed ? `granted (${status.consent.source})` : `denied (${status.consent.reason})`}`,
      `Examples: ${status.examples}`,
      `Authoritative/derived labels: ${status.labels}`,
      `Active profile: ${status.activeProfileId ?? "baseline"}`,
      `Next expiry: ${status.nextExpiryAt ?? "none"}`,
      `Policy: ${LEARNING_CONSENT_POLICY_VERSION}`,
    ])
  }

  if (action === "list") {
    const examples = store.listExamples({
      workspaceRef: store.workspaceReference(workspace),
      limit: Math.max(1, Math.min(200, Math.floor(input.limit ?? 20))),
    })
    if (!examples.length) return result(["No retained learning examples for this workspace."])
    return result(
      examples.map(
        (example) =>
          `${example.id}  ${example.createdAt}  ${example.runtime}  score=${example.response.final.score.toFixed(2)}  ${example.response.disposition}`,
      ),
    )
  }

  if (action === "consent") {
    const decision = (parts[1] ?? "status").toLowerCase()
    if (decision === "status") return runLearningDataCommand(store, workspace, { action: ["status"] })
    if (!(["grant", "revoke", "inherit"] as string[]).includes(decision)) {
      return result([], ["Usage: arcana ml-data consent <grant|revoke|inherit> [--scope device|workspace]"])
    }
    const scopeType = input.scope ?? "workspace"
    if (decision === "inherit" && scopeType !== "workspace") {
      return result([], ["Only workspace consent can inherit device consent."])
    }
    if (decision === "grant" && !input.yes) {
      return result(
        [LEARNING_CONSENT_DISCLOSURE],
        ["Consent was not changed. Re-run with --yes after reviewing the disclosure."],
      )
    }
    const receipt = store.recordConsent({
      scopeType,
      workspace: scopeType === "workspace" ? workspace : undefined,
      action: decision as "grant" | "revoke" | "inherit",
      retentionDays: input.retentionDays ?? DEFAULT_LEARNING_RETENTION_DAYS,
      source: input.source ?? "cli",
    })
    return result([
      `${scopeType} learning consent: ${receipt.action}`,
      `Receipt: ${receipt.id}`,
      `Retention for new examples: ${receipt.retentionDays} days`,
    ])
  }

  if (action === "purge") {
    if (!input.yes) return result([], ["Purge requires --yes. Consent is unchanged by purge."])
    const scopeType = input.scope ?? "workspace"
    const purged = store.purge({ scopeType, workspace: scopeType === "workspace" ? workspace : undefined })
    return result([
      `Purged ${purged.examples} learning example(s) and ${purged.profiles} calibration profile(s).`,
      "Consent was not changed.",
    ])
  }

  if (action === "label") {
    const exampleId = parts[1]
    if (!exampleId) return result([], ["Usage: arcana ml-data label <example-id> --positive|--negative"])
    if (input.positive === input.negative) {
      return result([], ["Choose exactly one of --positive or --negative."])
    }
    const stored = store.appendLabel(exampleId, {
      kind: "response_rating",
      value: input.positive ? "positive" : "negative",
      source: "explicit_user",
      confidence: 1,
      provenance: "USER_INSTRUCTION",
    })
    if (!stored.stored) return result([], [stored.reason])
    const calibration = store.calibrateAndMaybeActivate(workspace)
    return result([
      `Stored authoritative label ${stored.label!.id}.`,
      calibration.activated
        ? `Activated calibration profile ${calibration.storedProfileId}.`
        : `Calibration unchanged: ${calibration.activationReason}`,
    ])
  }

  if (action === "calibrate") {
    const calibration = store.calibrateAndMaybeActivate(workspace)
    return result([
      calibration.activated
        ? `Activated calibration profile ${calibration.storedProfileId}.`
        : `Calibration unchanged: ${calibration.activationReason}`,
    ])
  }

  if (action === "export") {
    if (!input.output?.trim()) return result([], ["Export requires --output <local-path>."])
    const scopeType = input.scope ?? "workspace"
    const exported = exportLearningDataset(store, {
      output: input.output,
      workspace: scopeType === "workspace" ? workspace : undefined,
      scopeType,
      includeContent: input.includeContent,
      acknowledgePrivateData: input.acknowledgePrivateData,
    })
    return result([
      `Exported ${exported.data.exampleCount} example(s) and ${exported.data.labelCount} label(s).`,
      `Dataset: ${exported.output}`,
      `Manifest: ${exported.manifest}`,
      `SHA-256: ${exported.data.jsonlSha256}`,
    ])
  }

  return result([], ["Usage: arcana ml-data <status|list|consent|label|calibrate|export|purge>"])
}
