#!/usr/bin/env bun
/**
 * Contract parity lint: contracts/approval-api.v1.yaml + contracts/events.v1.json
 * against the mounted runtime HttpApi surface and the emitted durable governance
 * events.
 *
 * Gathers the live surface (OpenApi.fromApi(ArcanaHttpApi), the runtime server
 * source, docs/RUNTIME-API-CONTRACT.md) and the live event definitions
 * (EventV2 envelopes defined by the engine, plus the ArcanaEvent governance
 * families), feeds them into the pure comparison functions in
 * src/server/contract/parity.ts, and prints the report.
 *
 * Exit code 0 when no error-severity findings; 1 otherwise.
 */

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { OpenApi } from "effect/unstable/httpapi"
import { ArcanaEvent } from "@arcana/core/epistemic/event"
import { ArcanaHttpApi } from "../src/server/routes/instance/httpapi/api"
import { ApprovalEvent } from "../src/approval/events"
import { GovernanceEvent } from "../src/session/epistemic/governance-event"
import { SessionStatus } from "../src/session/status"
import {
  checkOutOfContractTransport,
  checkV2ErrorClasses,
  compareContractErrorComponents,
  compareErrorStatuses,
  compareEvents,
  compareQueryParams,
  compareSuccessStatuses,
  compareSurfaces,
  mountedRuntimeOperations,
  outOfScopeMountedPaths,
  parseContractOperations,
  parseEventCatalog,
  structFieldNames,
  summarize,
  unionLiteralValues,
  type EmittedEvent,
  type Finding,
} from "../src/server/contract/parity"

const repoRoot = join(dirname(import.meta.dir), "..", "..")

const read = (relative: string): string => readFileSync(join(repoRoot, relative), "utf8")

const openapi = OpenApi.fromApi(ArcanaHttpApi)
const contractText = read("contracts/approval-api.v1.yaml")
const eventCatalogText = read("contracts/events.v1.json")
const serverSource = read("packages/engine/src/server/routes/instance/httpapi/server.ts")
const runtimeContractDoc = read("docs/RUNTIME-API-CONTRACT.md")

const declared = parseContractOperations(contractText)
const mounted = mountedRuntimeOperations(openapi)

/**
 * Emitted durable governance kinds:
 *  - EventV2 envelopes the engine defines and publishes on the SSE stream:
 *    approval.updated, governance.recorded, session.status, session.idle.
 *  - ArcanaEvent governance families embedded in governance.recorded
 *    (the prefixes declared in session/epistemic/governance-event.ts).
 */
const envelopeEvents: EmittedEvent[] = [
  { type: ApprovalEvent.type, kind: "envelope", payloadKeys: structFieldNames(ApprovalEvent.data) },
  { type: GovernanceEvent.Recorded.type, kind: "envelope", payloadKeys: structFieldNames(GovernanceEvent.Recorded.data) },
  { type: SessionStatus.Event.Status.type, kind: "envelope", payloadKeys: structFieldNames(SessionStatus.Event.Status.data) },
  { type: SessionStatus.Event.Idle.type, kind: "envelope", payloadKeys: structFieldNames(SessionStatus.Event.Idle.data) },
]
const governancePrefixes = GovernanceEvent.prefixes
const innerEvents: EmittedEvent[] = unionLiteralValues(ArcanaEvent.fields.type)
  .filter((type) => governancePrefixes.some((prefix) => type.startsWith(prefix)))
  .map((type) => ({ type, kind: "inner" as const }))

const findings: Finding[] = []

const surface = compareSurfaces(declared, mounted)
for (const key of surface.declaredNotMounted) {
  findings.push({ severity: "error", section: "surface", message: `declared in contract but not mounted: ${key}` })
}
for (const key of surface.mountedNotDeclared) {
  findings.push({ severity: "error", section: "surface", message: `mounted but not declared in contract: ${key}` })
}

for (const message of compareErrorStatuses(declared, mounted)) {
  findings.push({ severity: "error", section: "error-statuses", message })
}
for (const message of checkV2ErrorClasses(mounted)) {
  findings.push({ severity: "error", section: "v2-error-classes", message })
}
for (const message of compareContractErrorComponents(declared, mounted)) {
  findings.push({ severity: "error", section: "error-components", message })
}
for (const message of compareQueryParams(declared, mounted)) {
  findings.push({ severity: "error", section: "query-params", message })
}
for (const message of compareSuccessStatuses(declared, mounted)) {
  findings.push({ severity: "error", section: "success-statuses", message })
}
for (const message of checkOutOfContractTransport(openapi, serverSource, runtimeContractDoc)) {
  findings.push({ severity: "error", section: "transport", message })
}

const catalog = parseEventCatalog(eventCatalogText)
const events = compareEvents([...envelopeEvents, ...innerEvents], catalog)
for (const type of events.undocumentedEmitted) {
  findings.push({ severity: "error", section: "events", message: `emitted but not cataloged: ${type}` })
}
for (const type of events.phantomCatalog) {
  findings.push({ severity: "info", section: "events", message: `cataloged but no live emitter: ${type}` })
}
for (const message of events.payloadMismatches) {
  findings.push({ severity: "error", section: "events", message })
}
for (const type of events.catalogRefsUnknown) {
  findings.push({ severity: "error", section: "events", message: `aggregation/breakthrough references unknown catalog type: ${type}` })
}

for (const key of outOfScopeMountedPaths(openapi, declared)) {
  findings.push({ severity: "info", section: "surface", message: `mounted outside contract scope: ${key}` })
}

const report = summarize(findings)
console.log(report.text)
process.exit(report.exitCode)
