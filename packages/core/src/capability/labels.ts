/**
 * Phase C Tasks 9-10: Security Label Operations
 *
 * Pure, deterministic operations for provenance and sensitivity propagation.
 * Labels are immutable once attached. Only declassification (trusted runtime) can reduce sensitivity.
 *
 * Hard invariants:
 *   Provenance(z) ⊇ ⋃ Provenance(xᵢ)       — provenance only grows
 *   Sensitivity(z) = ⊔ Sensitivity(xᵢ)      — sensitivity is join (max)
 *   Labels ≠ Authorization                     — labels restrict, never grant
 */

import type {
  ProvenanceLabel,
  SensitivityLabel,
  SecurityLabels,
  LabeledValue,
  LabeledAuthorizationField,
  DeclassificationDecision,
} from "./types"
import { SENSITIVITY_ORDER } from "./types"

// ─── Label Construction ───────────────────────────────────────────────

/**
 * Create SecurityLabels from provenance set and sensitivity.
 */
export function createLabels(
  provenance: Iterable<ProvenanceLabel>,
  sensitivity: SensitivityLabel,
): SecurityLabels {
  return Object.freeze({
    provenance: Object.freeze(new Set(provenance)),
    sensitivity,
  })
}

/**
 * Label a value with given security labels and source event IDs.
 */
export function labelValue<T>(
  value: T,
  labels: SecurityLabels,
  sourceEventIds: ReadonlyArray<string> = [],
): LabeledValue<T> {
  return Object.freeze({
    value,
    labels: Object.freeze({
      provenance: labels.provenance,
      sensitivity: labels.sensitivity,
    }),
    sourceEventIds: Object.freeze([...sourceEventIds]),
  }) as LabeledValue<T>
}

// ─── Label Combination ────────────────────────────────────────────────

/**
 * Combine two security labels conservatively.
 * Provenance: union (only grows).
 * Sensitivity: join (maximum).
 */
export function combineLabels(a: SecurityLabels, b: SecurityLabels): SecurityLabels {
  const combinedProvenance = new Set<ProvenanceLabel>([...a.provenance, ...b.provenance])
  const combinedSensitivity = combineSensitivity(a.sensitivity, b.sensitivity)
  return createLabels(combinedProvenance, combinedSensitivity)
}

/**
 * Combine multiple security labels.
 * Returns PUBLIC with empty provenance if no labels provided.
 */
export function combineAllLabels(labels: ReadonlyArray<SecurityLabels>): SecurityLabels {
  if (labels.length === 0) {
    return createLabels([], "PUBLIC")
  }
  return labels.reduce(combineLabels)
}

/**
 * Combine two sensitivity labels using the lattice join.
 * PUBLIC ≤ INTERNAL ≤ PRIVATE ≤ SECRET.
 */
export function combineSensitivity(a: SensitivityLabel, b: SensitivityLabel): SensitivityLabel {
  return SENSITIVITY_ORDER[a] >= SENSITIVITY_ORDER[b] ? a : b
}

// ─── Labeled Value Operations ─────────────────────────────────────────

/**
 * Transform a labeled value's data while preserving all labels and source traceability.
 * The output inherits ALL provenance from the input.
 */
export function mapLabeledValue<T, U>(
  labeled: LabeledValue<T>,
  transform: (value: T) => U,
): LabeledValue<U> {
  return labelValue(
    transform(labeled.value),
    labeled.labels,
    [...labeled.sourceEventIds],
  )
}

/**
 * Derive a new labeled value from multiple source values.
 * Provenance: union of all sources.
 * Sensitivity: join (max) of all sources.
 * Source event IDs: union of all sources.
 */
export function deriveLabeledValue<T>(
  value: T,
  sources: ReadonlyArray<LabeledValue<unknown>>,
  additionalProvenance: ReadonlyArray<ProvenanceLabel> = [],
  additionalSourceEventIds: ReadonlyArray<string> = [],
): LabeledValue<T> {
  const allProvenance = new Set<ProvenanceLabel>(additionalProvenance)
  let maxSensitivity: SensitivityLabel = "PUBLIC"
  const allSourceEventIds = new Set<string>(additionalSourceEventIds)

  for (const source of sources) {
    for (const p of source.labels.provenance) {
      allProvenance.add(p)
    }
    maxSensitivity = combineSensitivity(maxSensitivity, source.labels.sensitivity)
    for (const id of source.sourceEventIds) {
      allSourceEventIds.add(id)
    }
  }

  return labelValue(
    value,
    createLabels(allProvenance, maxSensitivity),
    [...allSourceEventIds],
  )
}

// ─── Declassification ─────────────────────────────────────────────────

/**
 * Validate a declassification decision.
 * Returns null if valid, or a reason string if invalid.
 *
 * Rules:
 * - Must target a lower sensitivity than source
 * - Must not broaden scope beyond declared fields
 * - Must not be expired
 * - Must reference a valid capability
 */
export function validateDeclassification(
  decision: DeclassificationDecision,
  now: string,
): string | null {
  if (SENSITIVITY_ORDER[decision.targetSensitivity] >= SENSITIVITY_ORDER[decision.sourceSensitivity]) {
    return "target sensitivity must be lower than source"
  }
  if (decision.fields.length === 0) {
    return "declassification must specify at least one field"
  }
  if (!decision.capabilityId || decision.capabilityId.length === 0) {
    return "declassification must reference a capability"
  }
  if (!decision.purpose || decision.purpose.length === 0) {
    return "declassification must declare a purpose"
  }
  if (decision.expiresAt && decision.expiresAt <= now) {
    return "declassification has expired"
  }
  return null
}

/**
 * Apply a validated declassification to a labeled value.
 * Creates a NEW labeled derivative — does not mutate the original.
 * Only trusted runtime code may call this.
 *
 * Returns the declassified value or throws if validation fails.
 */
export function declassifyValue<T>(
  labeled: LabeledValue<T>,
  decision: DeclassificationDecision,
  now: string,
): LabeledValue<T> {
  const error = validateDeclassification(decision, now)
  if (error) {
    throw new Error(`Declassification denied: ${error}`)
  }

  // Create new labels with reduced sensitivity but preserved provenance
  const newLabels = createLabels(
    labeled.labels.provenance,
    decision.targetSensitivity,
  )

  return labelValue(labeled.value, newLabels, [...labeled.sourceEventIds])
}

// ─── Label Tampering Detection ────────────────────────────────────────

/**
 * Check if an attempt was made to remove or lower labels.
 * Returns true if the new labels are NOT a conservative derivation of the old labels.
 *
 * Tampering = provenance removed OR sensitivity decreased without declassification.
 */
export function detectLabelTampering(
  original: SecurityLabels,
  claimed: SecurityLabels,
  hasDeclassification: boolean,
): { tampered: boolean; reason: string | null } {
  // Check provenance: every original label must be present
  for (const p of original.provenance) {
    if (!claimed.provenance.has(p)) {
      return { tampered: true, reason: `provenance label ${p} removed` }
    }
  }

  // Check sensitivity: cannot decrease without declassification
  if (!hasDeclassification && SENSITIVITY_ORDER[claimed.sensitivity] < SENSITIVITY_ORDER[original.sensitivity]) {
    return {
      tampered: true,
      reason: `sensitivity decreased from ${original.sensitivity} to ${claimed.sensitivity} without declassification`,
    }
  }

  return { tampered: false, reason: null }
}

// ─── Aggregate Label Computation ──────────────────────────────────────

/**
 * Compute conservative aggregate labels from heterogeneous field labels.
 * Used for PDP authorization requests where different fields have different labels.
 */
export function aggregateFieldLabels(
  fields: ReadonlyArray<LabeledAuthorizationField>,
): SecurityLabels {
  const allProvenance = new Set<ProvenanceLabel>()
  let maxSensitivity: SensitivityLabel = "PUBLIC"

  for (const field of fields) {
    for (const p of field.provenance) {
      allProvenance.add(p)
    }
    maxSensitivity = combineSensitivity(maxSensitivity, field.sensitivity)
  }

  return createLabels(allProvenance, maxSensitivity)
}

// ─── Source Classification Helpers ────────────────────────────────────

/**
 * Create labels for user input.
 * Default: USER_INSTRUCTION + INTERNAL.
 */
export function classifyUserInput(
  overrideSensitivity?: SensitivityLabel,
): SecurityLabels {
  return createLabels(["USER_INSTRUCTION"], overrideSensitivity ?? "INTERNAL")
}

/**
 * Create labels for an active contract.
 */
export function classifyActiveContract(
  sourceSensitivity: SensitivityLabel,
): SecurityLabels {
  return createLabels(["ACTIVE_CONTRACT"], sourceSensitivity)
}

/**
 * Create labels for trusted workspace content.
 */
export function classifyTrustedLocalSource(
  sensitivity: SensitivityLabel = "INTERNAL",
): SecurityLabels {
  return createLabels(["TRUSTED_LOCAL_SOURCE"], sensitivity)
}

/**
 * Create labels for untrusted repository content.
 * Examples: README, issue text, generated config, downloaded repo.
 */
export function classifyUntrustedLocalSource(
  sensitivity: SensitivityLabel = "INTERNAL",
): SecurityLabels {
  return createLabels(["UNTRUSTED_LOCAL_SOURCE"], sensitivity)
}

/**
 * Create labels for remote content.
 * Default: PUBLIC unless known otherwise.
 */
export function classifyRemoteContent(
  sensitivity: SensitivityLabel = "PUBLIC",
): SecurityLabels {
  return createLabels(["REMOTE_CONTENT"], sensitivity)
}

/**
 * Create labels for tool output.
 * Sensitivity should be join of tool input and returned content.
 */
export function classifyToolOutput(
  sensitivity: SensitivityLabel,
): SecurityLabels {
  return createLabels(["TOOL_OUTPUT"], sensitivity)
}

/**
 * Create labels for model output.
 * Sensitivity should be join of all material inputs.
 */
export function classifyModelOutput(
  sensitivity: SensitivityLabel,
): SecurityLabels {
  return createLabels(["MODEL_OUTPUT"], sensitivity)
}

/**
 * Create labels for subagent output.
 * Sensitivity should be inherited from delegated context.
 */
export function classifySubagentOutput(
  sensitivity: SensitivityLabel,
): SecurityLabels {
  return createLabels(["SUBAGENT_OUTPUT"], sensitivity)
}

/**
 * Create labels for MCP tool descriptions.
 */
export function classifyMcpDescription(
  sensitivity: SensitivityLabel = "INTERNAL",
): SecurityLabels {
  return createLabels(["MCP_DESCRIPTION"], sensitivity)
}

/**
 * Create labels for secret values from trusted broker.
 */
export function classifySecret(
  source: string = "SYSTEM_POLICY",
): SecurityLabels {
  return createLabels([source as ProvenanceLabel], "SECRET")
}

/**
 * Create labels for system policy values.
 */
export function classifySystemPolicy(): SecurityLabels {
  return createLabels(["SYSTEM_POLICY"], "INTERNAL")
}
