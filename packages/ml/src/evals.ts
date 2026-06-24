import { readFile } from "node:fs/promises"
import { analyzeSqlOptimization, type SqlDialect, type SqlOptimizationPlan } from "./sql.js"
import { compressSemantically, planTokenBudget, type TokenBudgetPlan } from "./token.js"
import { evaluateResponseQuality, type QualityGateVerdict } from "./quality.js"
import {
  inferExpectationContract,
  type EvidenceNeed,
  type ExpectedDeliverable,
  type InteractionIntervention,
  type QualityBar,
} from "./expectation.js"
import { planMachineResourceUse, type DiskPosture, type MachineResourceInput, type MachineResourcePlan } from "./machine.js"

export type EvalStatus = "pass" | "fail"

export type EvalCaseResult = {
  suite: string
  name: string
  status: EvalStatus
  message?: string
}

export type EvalRunResult = {
  passed: number
  failed: number
  total: number
  results: EvalCaseResult[]
}

type ExpectationFixture = {
  name: string
  request: string
  expected: {
    deliverable: ExpectedDeliverable
    qualityBar: QualityBar
    evidenceNeed?: EvidenceNeed
    interactionIntervention?: InteractionIntervention
  }
}

type QualityFixture = {
  name: string
  request: string
  response: string
  expectation?: { request: string }
  expectedVerdict: QualityGateVerdict
  minimumProblems?: number
}

type TokenFixture = {
  name: string
  text: string
  repeat?: number
  maxContextTokens: number
  reservedOutputTokens: number
  expectedStatus: TokenBudgetPlan["status"]
  mustCompress: boolean
}

type SqlFixture = {
  name: string
  dialect: SqlDialect
  query: string
  schemaSummary?: string
  expectedIntent: SqlOptimizationPlan["intent"]
  expectedCategories: Array<SqlOptimizationPlan["findings"][number]["category"]>
}

type MachineFixture = {
  name: string
  input: MachineResourceInput
  expected: {
    posture: DiskPosture
    requiresApproval: boolean
    cleanupStrategy: MachineResourcePlan["cleanup"]["strategy"]
  }
}

const FIXTURE_FILES = {
  expectation: "expectation.fixtures.json",
  quality: "quality.fixtures.json",
  token: "token.fixtures.json",
  sql: "sql.fixtures.json",
  machine: "machine.fixtures.json",
} as const

function pass(suite: string, name: string): EvalCaseResult {
  return { suite, name, status: "pass" }
}

function fail(suite: string, name: string, message: string): EvalCaseResult {
  return { suite, name, status: "fail", message }
}

function assertEqual<T>(actual: T, expected: T, field: string): string | null {
  return Object.is(actual, expected) ? null : `${field}: expected ${String(expected)}, got ${String(actual)}`
}

async function readFixture<T>(filename: string): Promise<T[]> {
  const url = new URL(`../evals/${filename}`, import.meta.url)
  const raw = await readFile(url, "utf8")
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error(`Fixture ${filename} must be a JSON array.`)
  return parsed as T[]
}

function runExpectationFixtures(fixtures: ExpectationFixture[]): EvalCaseResult[] {
  return fixtures.map((fixture) => {
    const actual = inferExpectationContract({ request: fixture.request })
    const errors = [
      assertEqual(actual.deliverable, fixture.expected.deliverable, "deliverable"),
      assertEqual(actual.qualityBar, fixture.expected.qualityBar, "qualityBar"),
      fixture.expected.evidenceNeed ? assertEqual(actual.evidenceNeed, fixture.expected.evidenceNeed, "evidenceNeed") : null,
      fixture.expected.interactionIntervention
        ? assertEqual(actual.interactionIntervention, fixture.expected.interactionIntervention, "interactionIntervention")
        : null,
    ].filter((error): error is string => Boolean(error))
    return errors.length ? fail("expectation", fixture.name, errors.join("; ")) : pass("expectation", fixture.name)
  })
}

function runQualityFixtures(fixtures: QualityFixture[]): EvalCaseResult[] {
  return fixtures.map((fixture) => {
    const expectation = fixture.expectation ? inferExpectationContract({ request: fixture.expectation.request }) : undefined
    const actual = evaluateResponseQuality({ request: fixture.request, response: fixture.response, expectation })
    const errors = [
      assertEqual(actual.verdict, fixture.expectedVerdict, "verdict"),
      actual.problems.length >= (fixture.minimumProblems ?? 0)
        ? null
        : `problems: expected at least ${fixture.minimumProblems ?? 0}, got ${actual.problems.length}`,
    ].filter((error): error is string => Boolean(error))
    return errors.length ? fail("quality", fixture.name, errors.join("; ")) : pass("quality", fixture.name)
  })
}

function runTokenFixtures(fixtures: TokenFixture[]): EvalCaseResult[] {
  return fixtures.map((fixture) => {
    const text = fixture.text.repeat(fixture.repeat ?? 1)
    const budget = planTokenBudget({
      text,
      maxContextTokens: fixture.maxContextTokens,
      reservedOutputTokens: fixture.reservedOutputTokens,
    })
    const compression = compressSemantically({ text, targetRatio: 0.5 })
    const didCompress = compression.compressedEstimatedTokens < compression.originalEstimatedTokens
    const errors = [
      assertEqual(budget.status, fixture.expectedStatus, "status"),
      assertEqual(didCompress, fixture.mustCompress, "mustCompress"),
    ].filter((error): error is string => Boolean(error))
    return errors.length ? fail("token", fixture.name, errors.join("; ")) : pass("token", fixture.name)
  })
}

function runSqlFixtures(fixtures: SqlFixture[]): EvalCaseResult[] {
  return fixtures.map((fixture) => {
    const plan = analyzeSqlOptimization({
      dialect: fixture.dialect,
      query: fixture.query,
      schemaSummary: fixture.schemaSummary,
    })
    const categories = new Set<SqlOptimizationPlan["findings"][number]["category"]>(plan.findings.map((finding) => finding.category))
    const missing = fixture.expectedCategories.filter((category) => !categories.has(category))
    const errors = [
      assertEqual(plan.intent, fixture.expectedIntent, "intent"),
      missing.length ? `missing categories: ${missing.join(", ")}` : null,
    ].filter((error): error is string => Boolean(error))
    return errors.length ? fail("sql", fixture.name, errors.join("; ")) : pass("sql", fixture.name)
  })
}

function runMachineFixtures(fixtures: MachineFixture[]): EvalCaseResult[] {
  return fixtures.map((fixture) => {
    const plan = planMachineResourceUse(fixture.input)
    const errors = [
      assertEqual(plan.posture, fixture.expected.posture, "posture"),
      assertEqual(plan.requiresApproval, fixture.expected.requiresApproval, "requiresApproval"),
      assertEqual(plan.cleanup.strategy, fixture.expected.cleanupStrategy, "cleanup.strategy"),
    ].filter((error): error is string => Boolean(error))
    return errors.length ? fail("machine", fixture.name, errors.join("; ")) : pass("machine", fixture.name)
  })
}

export async function runMlEvals(): Promise<EvalRunResult> {
  const results = [
    ...runExpectationFixtures(await readFixture<ExpectationFixture>(FIXTURE_FILES.expectation)),
    ...runQualityFixtures(await readFixture<QualityFixture>(FIXTURE_FILES.quality)),
    ...runTokenFixtures(await readFixture<TokenFixture>(FIXTURE_FILES.token)),
    ...runSqlFixtures(await readFixture<SqlFixture>(FIXTURE_FILES.sql)),
    ...runMachineFixtures(await readFixture<MachineFixture>(FIXTURE_FILES.machine)),
  ]
  const failed = results.filter((result) => result.status === "fail").length
  return { passed: results.length - failed, failed, total: results.length, results }
}

if (import.meta.main) {
  const run = await runMlEvals()
  for (const result of run.results) {
    const marker = result.status === "pass" ? "✓" : "✗"
    console.log(`${marker} ${result.suite}/${result.name}${result.message ? ` — ${result.message}` : ""}`)
  }
  console.log(`\n${run.passed}/${run.total} evals passed`)
  if (run.failed > 0) process.exitCode = 1
}
