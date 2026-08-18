// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

/**
 * Machine-layer augmentation for the deterministic firewall.
 *
 * `inspectEffect` is authoritative; @arcana/ml's classifier can only
 * escalate (benign -> review -> block). This keeps the security invariant:
 * a pattern miss can be caught by the signal engine, but a machine miss can
 * never downgrade a deterministic finding.
 */

import { classifyEffect, mergeClassifier } from "@arcana/ml/classifier"
import { inspectEffect, type EffectInspectReport } from "./inspect"

export function inspectEffectWithML(input: { tool: string; args?: unknown }): EffectInspectReport {
  const report = inspectEffect(input)
  const args = (input.args ?? {}) as Record<string, unknown>
  const command = typeof args.command === "string" ? args.command : ""
  const path = typeof args.filePath === "string"
    ? args.filePath
    : typeof args.filepath === "string"
      ? args.filepath
      : ""
  const ml = classifyEffect({
    tool: input.tool,
    args: { command, filepath: path },
    command,
    path,
    firewall: report,
  })
  const merged = mergeClassifier(report, ml)
  const controls = new Set(report.controls)
  if (merged.verdict !== report.verdict) controls.add("approval")
  return {
    ...report,
    verdict: merged.verdict,
    risk: merged.risk,
    findings: merged.findings,
    controls: [...controls],
    classifier: {
      verdict: ml.verdict,
      risk: ml.risk,
      confidence: ml.confidence,
      labels: ml.labels,
      reasons: ml.reasons,
    },
  }
}

/**
 * Merge the machine classifier into an inspect report already attached to a
 * permission request. Returns undefined when there is no base report — the
 * permission layer then fails closed (asks) exactly as before, so ML never
 * invents a benign verdict for an ungoverned ask path.
 */
export function mergeInspectWithClassifier(
  report: EffectInspectReport | undefined,
  tool: string,
  metadata: Record<string, unknown>,
): EffectInspectReport | undefined {
  if (!report) return undefined
  const command = typeof metadata.command === "string" ? metadata.command : ""
  const path = typeof metadata.filepath === "string"
    ? metadata.filepath
    : typeof metadata.filePath === "string"
      ? metadata.filePath
      : ""
  const ml = classifyEffect({
    tool,
    args: { command, filepath: path },
    command,
    path,
    firewall: report,
  })
  const merged = mergeClassifier(report, ml)
  const controls = new Set(report.controls)
  if (merged.verdict !== report.verdict) controls.add("approval")
  return {
    ...report,
    verdict: merged.verdict,
    risk: merged.risk,
    findings: merged.findings,
    controls: [...controls],
    classifier: {
      verdict: ml.verdict,
      risk: ml.risk,
      confidence: ml.confidence,
      labels: ml.labels,
      reasons: ml.reasons,
    },
  }
}
