import {
  LearningDatasetManifestV1Schema,
  learningReference,
  type LearningDatasetManifestV1,
  type LearningExampleV1,
  type LearningLabelV1,
  type LearningScopeType,
} from "@arcana/ml/learning"
import { createHash, randomBytes, randomUUID } from "node:crypto"
import { closeSync, existsSync, mkdirSync, openSync, renameSync, rmSync, writeFileSync, writeSync } from "node:fs"
import path from "node:path"

import { LearningStore } from "./learning-store.js"

export type LearningExportOptions = {
  output: string
  workspace?: string
  scopeType?: LearningScopeType
  includeContent?: boolean
  acknowledgePrivateData?: boolean
  includeExpired?: boolean
}

export type LearningExportResult = {
  output: string
  manifest: string
  auditId: string
  data: LearningDatasetManifestV1
}

function exportedText(
  text: LearningExampleV1["request"],
  includeContent: boolean,
  exportSecret: string,
): LearningExampleV1["request"] {
  return {
    ...text,
    content: includeContent ? text.content : null,
    digest: learningReference(exportSecret, "content", text.digest),
  }
}

function sumRedactions(target: Record<string, number>, text: LearningExampleV1["request"] | null): void {
  if (!text) return
  for (const [category, count] of Object.entries(text.redactions)) {
    target[category] = (target[category] ?? 0) + count
  }
}

function rekeyExample(example: LearningExampleV1, includeContent: boolean, exportSecret: string): LearningExampleV1 {
  const rekey = (namespace: string, value: string) => learningReference(exportSecret, namespace, value)
  return {
    ...example,
    id: rekey("example", example.id),
    consentReceiptId: rekey("consent", example.consentReceiptId),
    consentScopeRef: example.consentScopeType === "device" ? "device" : rekey("scope", example.consentScopeRef),
    workspaceRef: rekey("workspace", example.workspaceRef),
    sessionRef: rekey("session", example.sessionRef),
    messageRef: rekey("message", example.messageRef),
    request: exportedText(example.request, includeContent, exportSecret),
    draftResponse: example.draftResponse ? exportedText(example.draftResponse, includeContent, exportSecret) : null,
    finalResponse: exportedText(example.finalResponse, includeContent, exportSecret),
    preparation: {
      ...example.preparation,
      context: example.preparation.context.map((item) => ({
        ...item,
        itemRef: rekey("context", item.itemRef),
      })),
    },
  }
}

function rekeyLabel(label: LearningLabelV1, exportSecret: string): LearningLabelV1 {
  const rekey = (namespace: string, value: string) => learningReference(exportSecret, namespace, value)
  return {
    ...label,
    id: rekey("label", label.id),
    exampleId: rekey("example", label.exampleId),
    targetRef: label.targetRef ? rekey("target", label.targetRef) : undefined,
  }
}

/**
 * Writes a local JSONL dataset and a sidecar integrity manifest. Existing files
 * are never overwritten, and all stable internal references are re-keyed for
 * this export so separate exports cannot be joined by identifier.
 */
export function exportLearningDataset(store: LearningStore, options: LearningExportOptions): LearningExportResult {
  const output = path.resolve(options.output)
  const manifestPath = `${output}.manifest.json`
  if (options.includeContent && !options.acknowledgePrivateData) {
    throw new Error("Content export requires --acknowledge-private-data.")
  }
  if (existsSync(output) || existsSync(manifestPath)) {
    throw new Error("Export destination already exists; refusing to overwrite it.")
  }
  if (options.scopeType === "workspace" && !options.workspace?.trim()) {
    throw new Error("Workspace export requires a workspace path.")
  }

  const workspaceRef = options.workspace ? store.workspaceReference(options.workspace) : undefined
  const scopeRef =
    options.scopeType === "device" ? "device" : options.scopeType === "workspace" ? workspaceRef : undefined
  const examples = store.listExamples({
    scopeType: options.scopeType,
    scopeRef,
    workspaceRef: options.scopeType === "workspace" ? workspaceRef : undefined,
    includeExpired: options.includeExpired,
    limit: 100_000,
  })
  const labels = store.listLabels(examples.map((example) => example.id))
  const includeContent = options.includeContent === true
  const exportSecret = randomBytes(32).toString("hex")
  const redactionCounts: Record<string, number> = {}
  const hash = createHash("sha256")
  const parent = path.dirname(output)
  mkdirSync(parent, { recursive: true })
  const temporary = path.join(parent, `.${path.basename(output)}.${randomUUID()}.tmp`)
  let fd: number | undefined
  try {
    fd = openSync(temporary, "wx", 0o600)
    const writeRecord = (record: unknown): void => {
      const line = `${JSON.stringify(record)}\n`
      writeSync(fd!, line, undefined, "utf8")
      hash.update(line, "utf8")
    }
    for (const example of examples) {
      sumRedactions(redactionCounts, example.request)
      sumRedactions(redactionCounts, example.draftResponse)
      sumRedactions(redactionCounts, example.finalResponse)
      writeRecord({ type: "example", data: rekeyExample(example, includeContent, exportSecret) })
    }
    for (const label of labels) {
      writeRecord({ type: "label", data: rekeyLabel(label, exportSecret) })
    }
    closeSync(fd)
    fd = undefined
    renameSync(temporary, output)
  } catch (error) {
    if (fd !== undefined) closeSync(fd)
    if (existsSync(temporary)) rmSync(temporary, { force: true })
    throw error
  }

  const data = LearningDatasetManifestV1Schema.parse({
    schemaVersion: "arcana.ml.learning-example.v1",
    exportedAt: new Date().toISOString(),
    exampleCount: examples.length,
    labelCount: labels.length,
    includeContent,
    scopeType: options.scopeType,
    scopeRef: scopeRef
      ? scopeRef === "device"
        ? "device"
        : learningReference(exportSecret, "scope", scopeRef)
      : undefined,
    jsonlSha256: hash.digest("hex"),
    redactionCounts,
  })
  const manifestJson = `${JSON.stringify(data, null, 2)}\n`
  try {
    writeFileSync(manifestPath, manifestJson, { encoding: "utf8", flag: "wx", mode: 0o600 })
  } catch (error) {
    // The dataset was created by this call and is removed if its integrity
    // manifest cannot be committed, avoiding a misleading partial export.
    if (existsSync(output)) rmSync(output, { force: true })
    throw error
  }
  const manifestSha256 = createHash("sha256").update(manifestJson, "utf8").digest("hex")
  let auditId: string
  try {
    auditId = store.recordExport({
      scopeType: options.scopeType,
      scopeRef,
      includeContent,
      exampleCount: examples.length,
      labelCount: labels.length,
      destination: output,
      jsonlSha256: data.jsonlSha256,
      manifestSha256,
    })
  } catch (error) {
    if (existsSync(output)) rmSync(output, { force: true })
    if (existsSync(manifestPath)) rmSync(manifestPath, { force: true })
    throw error
  }
  return { output, manifest: manifestPath, auditId, data }
}
