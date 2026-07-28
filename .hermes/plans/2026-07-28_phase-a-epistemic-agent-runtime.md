# Phase A — Epistemic Agent Runtime Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Ship the first vertical slice of Arcana Epistemic OS — claims, contracts, obligations, and tamper-evident traces — as a governed completion system that measurably reduces false completions.

**Architecture:** Additive only. New types in `@arcana/core`, new tables in `memory.db`, new engine services, new TUI commands. Zero breaking changes to existing workflows. The epistemic layer is opt-in per session; sessions without contracts behave identically to today.

**Tech Stack:** TypeScript/Bun, Effect (existing), SQLite (existing memory.db), existing `@arcana/core` schema layer, existing TUI command spine.

**Success metric:** False completion rate drops measurably on evaluation set while adding <15% overhead.

**Evaluation set:** 8 curated tasks where agents commonly declare success prematurely (see Validation Criteria section).

---

## Existing Architecture Survey

**Current types to extend:**
- `packages/arcana/src/proof/types.ts` — `RunProof`, `ExecutionContract`, `RunProofEvent`, `Assumption` already exist but are unstructured
- `packages/engine/src/session/status.ts` — `SessionStatus` is `idle | retry | busy` — no completion states
- `packages/engine/src/session/system.ts` — System prompt assembly, memory injection point
- `packages/memory/src/db.ts` — SQLite schema with WAL, forward-only migrations
- `packages/engine/src/session/session.ts` — Session lifecycle, message processing

**New modules needed:**
- `packages/engine/src/session/epistemic/` — claim store, contract engine, obligation registry, event store
- `packages/engine/src/cli/cmd/` — new TUI commands (additive to existing spine)

**Migration strategy:**
- New SQLite tables in `memory.db` via idempotent `CREATE TABLE IF NOT EXISTS`
- New Effect services registered alongside existing ones
- Existing `ExecutionContract` type in proof/types.ts gets extended, not replaced
- FACTS.md compilation continues unchanged; claims are a parallel structured layer

---

## DELIVERABLE 1: Epistemic Primitives

### Task 1.1: Create Claim and Evidence types in @arcana/core

**Objective:** Add shared epistemic types that all packages can import.

**Files:**
- Create: `packages/core/src/epistemic/claim.ts`
- Create: `packages/core/src/epistemic/index.ts`

**Code:**

```ts
// packages/core/src/epistemic/claim.ts
import { Schema } from "effect"

export const ClaimStatus = Schema.Literal(
  "observed",
  "derived",
  "assumed",
  "predicted",
  "reported",
  "contradicted",
  "superseded",
  "verified",
)
export type ClaimStatus = typeof ClaimStatus.Type

export const EvidenceRelationship = Schema.Literal(
  "supports",
  "contradicts",
  "produced_by",
  "observed_in",
  "verified_by",
)
export type EvidenceRelationship = typeof EvidenceRelationship.Type

export const EvidenceRef = Schema.Struct({
  eventId: Schema.String,
  artifactDigest: Schema.optional(Schema.String),
  location: Schema.optional(Schema.Struct({
    file: Schema.optional(Schema.String),
    lineStart: Schema.optional(Schema.Number),
    lineEnd: Schema.optional(Schema.Number),
  })),
  relationship: EvidenceRelationship,
})
export type EvidenceRef = typeof EvidenceRef.Type

export const ClaimRef = Schema.Struct({
  claimId: Schema.String,
})
export type ClaimRef = typeof ClaimRef.Type

export const Claim = Schema.Struct({
  id: Schema.String,
  sessionId: Schema.String,
  proposition: Schema.String,
  status: ClaimStatus,
  scope: Schema.optional(Schema.Struct({
    workspace: Schema.optional(Schema.String),
    branch: Schema.optional(Schema.String),
    file: Schema.optional(Schema.String),
    symbol: Schema.optional(Schema.String),
  })),
  provenance: Schema.Array(EvidenceRef),
  dependencies: Schema.Array(ClaimRef),
  contradicts: Schema.Array(ClaimRef),
  validFrom: Schema.optional(Schema.String),
  validUntil: Schema.optional(Schema.String),
  lastVerifiedAt: Schema.optional(Schema.String),
  confidence: Schema.Number.pipe(Schema.between(0, 1)),
  calibrationDomain: Schema.optional(Schema.String),
  createdAt: Schema.String,
  createdByEventId: Schema.String,
})
export type Claim = typeof Claim.Type

export const ClaimOutcome = Schema.Struct({
  claimId: Schema.String,
  predictedConfidence: Schema.optional(Schema.Number),
  finalOutcome: Schema.Literal(
    "confirmed",
    "refuted",
    "partially_confirmed",
    "unresolved",
  ),
  resolvedBy: Schema.Array(EvidenceRef),
  resolvedAt: Schema.String,
})
export type ClaimOutcome = typeof ClaimOutcome.Type
```

```ts
// packages/core/src/epistemic/index.ts
export * as Epistemic from "./claim"
```

**Verification:** `cd L:/PROJECTS/arcana && bun run typecheck` — zero new errors in @arcana/core.

**Commit:**
```bash
git add packages/core/src/epistemic/
git commit -m "feat(core): add Claim, EvidenceRef, ClaimOutcome epistemic types"
```

---

### Task 1.2: Add claims table to memory.db

**Objective:** Persistent claim storage with migration safety.

**Files:**
- Modify: `packages/memory/src/db.ts`

**Code:** Append to `SCHEMA` string (before the final backtick):

```sql
CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  proposition TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN (
    'observed','derived','assumed','predicted','reported',
    'contradicted','superseded','verified'
  )),
  scope_workspace TEXT,
  scope_branch TEXT,
  scope_file TEXT,
  scope_symbol TEXT,
  confidence REAL DEFAULT 0.5,
  calibration_domain TEXT,
  valid_from TEXT,
  valid_until TEXT,
  last_verified_at TEXT,
  created_at TEXT NOT NULL,
  created_by_event_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS claim_evidence (
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  artifact_digest TEXT,
  location_file TEXT,
  location_line_start INTEGER,
  location_line_end INTEGER,
  relationship TEXT NOT NULL CHECK(relationship IN (
    'supports','contradicts','produced_by','observed_in','verified_by'
  )),
  PRIMARY KEY (claim_id, event_id, relationship)
);

CREATE TABLE IF NOT EXISTS claim_dependencies (
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  depends_on_claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  PRIMARY KEY (claim_id, depends_on_claim_id)
);

CREATE TABLE IF NOT EXISTS claim_contradictions (
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  contradicts_claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  PRIMARY KEY (claim_id, contradicts_claim_id)
);

CREATE TABLE IF NOT EXISTS claim_outcomes (
  claim_id TEXT PRIMARY KEY REFERENCES claims(id) ON DELETE CASCADE,
  predicted_confidence REAL,
  final_outcome TEXT NOT NULL CHECK(final_outcome IN (
    'confirmed','refuted','partially_confirmed','unresolved'
  )),
  resolved_at TEXT NOT NULL
);
```

**Verification:** Run typecheck, verify existing memory commands still work: `arcana memory compile`, `arcana memory search`.

**Commit:**
```bash
git add packages/memory/src/db.ts
git commit -m "feat(memory): add claims tables for structured knowledge storage"
```

---

### Task 1.3: Add ClaimStore service

**Objective:** Effect service wrapping claim CRUD operations.

**Files:**
- Create: `packages/engine/src/session/epistemic/claim-store.ts`

**Code:**

```ts
import { Effect, Context, Layer } from "effect"
import { Database } from "@/database"
import { Epistemic } from "@arcana/core/epistemic"
import { SessionID } from "../schema"

export interface Interface {
  readonly create: (claim: Epistemic.Claim) => Effect.Effect<void>
  readonly get: (id: string) => Effect.Effect<Epistemic.Claim | undefined>
  readonly listBySession: (sessionId: SessionID) => Effect.Effect<Epistemic.Claim[]>
  readonly updateStatus: (id: string, status: Epistemic.ClaimStatus) => Effect.Effect<void>
  readonly addEvidence: (claimId: string, evidence: Epistemic.EvidenceRef) => Effect.Effect<void>
  readonly addDependency: (claimId: string, dependsOnId: string) => Effect.Effect<void>
  readonly addContradiction: (claimId: string, contradictsId: string) => Effect.Effect<void>
  readonly recordOutcome: (outcome: Epistemic.ClaimOutcome) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/ClaimStore") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = yield* Database.Service

    const create = Effect.fn("ClaimStore.create")(function* (claim: Epistemic.Claim) {
      yield* Effect.promise(() =>
        db.db.run(
          `INSERT INTO claims (id, session_id, proposition, status, scope_workspace, scope_branch, scope_file, scope_symbol, confidence, calibration_domain, valid_from, valid_until, last_verified_at, created_at, created_by_event_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            claim.id, claim.sessionId, claim.proposition, claim.status,
            claim.scope?.workspace ?? null, claim.scope?.branch ?? null,
            claim.scope?.file ?? null, claim.scope?.symbol ?? null,
            claim.confidence, claim.calibrationDomain ?? null,
            claim.validFrom ?? null, claim.validUntil ?? null,
            claim.lastVerifiedAt ?? null, claim.createdAt, claim.createdByEventId,
          ],
        ),
      )
      // Insert evidence
      for (const ev of claim.provenance) {
        yield* addEvidence(claim.id, ev)
      }
      // Insert dependencies
      for (const dep of claim.dependencies) {
        yield* addDependency(claim.id, dep.claimId)
      }
      // Insert contradictions
      for (const con of claim.contradicts) {
        yield* addContradiction(claim.id, con.claimId)
      }
    })

    const get = Effect.fn("ClaimStore.get")(function* (id: string) {
      return yield* Effect.promise(() => {
        const row = db.db.query(`SELECT * FROM claims WHERE id = ?`).get(id) as any
        if (!row) return undefined
        return hydrateClaim(row, db)
      })
    })

    const listBySession = Effect.fn("ClaimStore.listBySession")(function* (sessionId: SessionID) {
      return yield* Effect.promise(() => {
        const rows = db.db.query(`SELECT * FROM claims WHERE session_id = ? ORDER BY created_at`).all(sessionId) as any[]
        return rows.map((r: any) => hydrateClaim(r, db))
      })
    })

    const updateStatus = Effect.fn("ClaimStore.updateStatus")(function* (id: string, status: Epistemic.ClaimStatus) {
      yield* Effect.promise(() =>
        db.db.run(`UPDATE claims SET status = ?, last_verified_at = ? WHERE id = ?`, [
          status, new Date().toISOString(), id,
        ]),
      )
    })

    const addEvidence = Effect.fn("ClaimStore.addEvidence")(function* (claimId: string, evidence: Epistemic.EvidenceRef) {
      yield* Effect.promise(() =>
        db.db.run(
          `INSERT OR IGNORE INTO claim_evidence (claim_id, event_id, artifact_digest, location_file, location_line_start, location_line_end, relationship)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [claimId, evidence.eventId, evidence.artifactDigest ?? null,
           evidence.location?.file ?? null, evidence.location?.lineStart ?? null,
           evidence.location?.lineEnd ?? null, evidence.relationship],
        ),
      )
    })

    const addDependency = Effect.fn("ClaimStore.addDependency")(function* (claimId: string, dependsOnId: string) {
      yield* Effect.promise(() =>
        db.db.run(`INSERT OR IGNORE INTO claim_dependencies (claim_id, depends_on_claim_id) VALUES (?, ?)`, [claimId, dependsOnId]),
      )
    })

    const addContradiction = Effect.fn("ClaimStore.addContradiction")(function* (claimId: string, contradictsId: string) {
      yield* Effect.promise(() =>
        db.db.run(`INSERT OR IGNORE INTO claim_contradictions (claim_id, contradicts_claim_id) VALUES (?, ?)`, [claimId, contradictsId]),
      )
    })

    const recordOutcome = Effect.fn("ClaimStore.recordOutcome")(function* (outcome: Epistemic.ClaimOutcome) {
      yield* Effect.promise(() =>
        db.db.run(
          `INSERT OR REPLACE INTO claim_outcomes (claim_id, predicted_confidence, final_outcome, resolved_at) VALUES (?, ?, ?, ?)`,
          [outcome.claimId, outcome.predictedConfidence ?? null, outcome.finalOutcome, outcome.resolvedAt],
        ),
      )
    })

    return Service.of({ create, get, listBySession, updateStatus, addEvidence, addDependency, addContradiction, recordOutcome })
  }),
)

// Helper: hydrate a DB row into a Claim type
function hydrateClaim(row: any, db: any): Epistemic.Claim {
  const evidence = db.query(`SELECT * FROM claim_evidence WHERE claim_id = ?`).all(row.id) as any[]
  const deps = db.query(`SELECT depends_on_claim_id FROM claim_dependencies WHERE claim_id = ?`).all(row.id) as any[]
  const contras = db.query(`SELECT contradicts_claim_id FROM claim_contradictions WHERE claim_id = ?`).all(row.id) as any[]

  return {
    id: row.id,
    sessionId: row.session_id,
    proposition: row.proposition,
    status: row.status,
    scope: row.scope_workspace ? {
      workspace: row.scope_workspace ?? undefined,
      branch: row.scope_branch ?? undefined,
      file: row.scope_file ?? undefined,
      symbol: row.scope_symbol ?? undefined,
    } : undefined,
    provenance: evidence.map((e: any) => ({
      eventId: e.event_id,
      artifactDigest: e.artifact_digest ?? undefined,
      location: e.location_file ? {
        file: e.location_file ?? undefined,
        lineStart: e.location_line_start ?? undefined,
        lineEnd: e.location_line_end ?? undefined,
      } : undefined,
      relationship: e.relationship,
    })),
    dependencies: deps.map((d: any) => ({ claimId: d.depends_on_claim_id })),
    contradicts: contras.map((c: any) => ({ claimId: c.contradicts_claim_id })),
    validFrom: row.valid_from ?? undefined,
    validUntil: row.valid_until ?? undefined,
    lastVerifiedAt: row.last_verified_at ?? undefined,
    confidence: row.confidence,
    calibrationDomain: row.calibration_domain ?? undefined,
    createdAt: row.created_at,
    createdByEventId: row.created_by_event_id,
  }
}
```

**Verification:** Typecheck passes. No runtime test yet — integration test comes in Task 4.4.

**Commit:**
```bash
git add packages/engine/src/session/epistemic/claim-store.ts
git commit -m "feat(engine): add ClaimStore Effect service for structured claims"
```

---

### Task 1.4: Add TUI commands :claims and :assumptions

**Objective:** Expose claims to the user via the command spine.

**Files:**
- Create: `packages/engine/src/cli/cmd/claims.ts` (or extend existing spine)

**Approach:** Add two slash commands to the existing TUI command handler. These are read-only inspection commands.

```ts
// In the TUI command handler (packages/engine/src/cli/cmd/... or session/processor.ts):

case ":claims":
  // List all claims for current session with status badges
  const claims = yield* ClaimStore.listBySession(sessionId)
  for (const c of claims) {
    const icon = statusIcon(c.status)
    output.push(`${icon} ${c.proposition.slice(0, 80)}`)
  }
  break

case ":assumptions":
  // Show only claims with assumed status
  const allClaims = yield* ClaimStore.listBySession(sessionId)
  const assumptions = allClaims.filter(c => c.status === "assumed")
  for (const a of assumptions) {
    output.push(`◇ ${a.proposition}`)
  }
  output.push(`\n${assumptions.length} unverified assumptions`)
  break
```

**Status icons:**
```
observed    ◆
derived     ◈
assumed     ◇
predicted   ◬
reported    ◉
contradicted ✕
superseded  ◁
verified    ●
```

**Verification:** Run `arcana run`, type `:claims` and `:assumptions`, verify output renders.

**Commit:**
```bash
git add packages/engine/src/cli/cmd/claims.ts  # or the modified file
git commit -m "feat(tui): add :claims and :assumptions inspection commands"
```

---

## DELIVERABLE 2: Contract Lifecycle

### Task 2.1: Define CompletionContract and CompletionResolution types

**Objective:** Type definitions for the contract system.

**Files:**
- Create: `packages/core/src/epistemic/contract.ts`
- Modify: `packages/core/src/epistemic/index.ts`

**Code:**

```ts
// packages/core/src/epistemic/contract.ts
import { Schema } from "effect"
import { ClaimRef } from "./claim"

export const TerminalRunState = Schema.Literal(
  "VERIFIED_COMPLETE",
  "PROVABLY_BLOCKED",
  "BUDGET_EXHAUSTED",
  "DECISION_REQUIRED",
)
export type TerminalRunState = typeof TerminalRunState.Type

export const Deliverable = Schema.Struct({
  description: Schema.String,
  artifactPattern: Schema.optional(Schema.String),
  verificationMethod: Schema.Literal("observation", "execution", "comparison", "human_decision", "external_confirmation"),
})
export type Deliverable = typeof Deliverable.Type

export const Constraint = Schema.Struct({
  description: Schema.String,
  kind: Schema.Literal("must", "must_not", "should", "should_not"),
})
export type Constraint = typeof Constraint.Type

export const AcceptanceCriterion = Schema.Struct({
  id: Schema.String,
  description: Schema.String,
  required: Schema.Boolean,
  verification: Schema.Literal("observation", "execution", "comparison", "human_decision", "external_confirmation"),
})
export type AcceptanceCriterion = typeof AcceptanceCriterion.Type

export const CompletionContract = Schema.Struct({
  id: Schema.String,
  sessionId: Schema.String,
  objective: Schema.String,
  deliverables: Schema.Array(Deliverable),
  constraints: Schema.Array(Constraint),
  acceptanceCriteria: Schema.Array(AcceptanceCriterion),
  assumptions: Schema.Array(ClaimRef),
  forbiddenOutcomes: Schema.Array(Schema.String),
  riskClass: Schema.Literal("read", "modify", "publish", "irreversible"),
  budget: Schema.optional(Schema.Struct({
    maxTokens: Schema.optional(Schema.Number),
    maxCost: Schema.optional(Schema.Number),
    maxWallTime: Schema.optional(Schema.Number),
  })),
  sourceEventId: Schema.String,
  compilerModel: Schema.optional(Schema.String),
  revision: Schema.Number,
  status: Schema.Literal("proposed", "active", "amended", "satisfied"),
})
export type CompletionContract = typeof CompletionContract.Type

export const CompletionResolution = Schema.Struct({
  state: TerminalRunState,
  reason: Schema.String,
  unresolved: Schema.Array(Schema.Struct({
    criterionId: Schema.String,
    description: Schema.String,
  })),
})
export type CompletionResolution = typeof CompletionResolution.Type
```

```ts
// Update packages/core/src/epistemic/index.ts:
export * as Epistemic from "./claim"
export * as Contract from "./contract"
```

**Verification:** Typecheck passes.

**Commit:**
```bash
git add packages/core/src/epistemic/
git commit -m "feat(core): add CompletionContract and CompletionResolution types"
```

---

### Task 2.2: Add contracts table to memory.db

**Objective:** Persistent contract storage.

**Files:**
- Modify: `packages/memory/src/db.ts`

**Code:** Append to `SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  objective TEXT NOT NULL,
  risk_class TEXT NOT NULL CHECK(risk_class IN ('read','modify','publish','irreversible')),
  source_event_id TEXT NOT NULL,
  compiler_model TEXT,
  revision INTEGER DEFAULT 1,
  status TEXT NOT NULL CHECK(status IN ('proposed','active','amended','satisfied')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution_state TEXT,
  resolution_reason TEXT
);

CREATE TABLE IF NOT EXISTS contract_acceptance_criteria (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  verification TEXT NOT NULL CHECK(verification IN ('observation','execution','comparison','human_decision','external_confirmation')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','satisfied','failed','waived','not_applicable')),
  evidence_event_id TEXT
);

CREATE TABLE IF NOT EXISTS contract_forbidden_outcomes (
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  PRIMARY KEY (contract_id, description)
);

CREATE TABLE IF NOT EXISTS contract_assumptions (
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL REFERENCES claims(id),
  PRIMARY KEY (contract_id, claim_id)
);
```

**Verification:** Typecheck, existing memory commands still work.

**Commit:**
```bash
git add packages/memory/src/db.ts
git commit -m "feat(memory): add contracts tables"
```

---

### Task 2.3: Implement ContractEngine service

**Objective:** Service managing contract lifecycle — proposal, activation, amendment, resolution.

**Files:**
- Create: `packages/engine/src/session/epistemic/contract-engine.ts`

**Code:**

```ts
import { Effect, Context, Layer } from "effect"
import { Database } from "@/database"
import { Contract } from "@arcana/core/epistemic/contract"
import { SessionID } from "../schema"
import { randomUUID } from "node:crypto"

export interface Interface {
  readonly propose: (input: {
    sessionId: SessionID
    userRequest: string
    sourceEventId: string
    model?: string
  }) => Effect.Effect<Contract.CompletionContract>
  readonly activate: (contractId: string) => Effect.Effect<void>
  readonly amend: (contractId: string, patch: Partial<Contract.CompletionContract>) => Effect.Effect<void>
  readonly get: (contractId: string) => Effect.Effect<Contract.CompletionContract | undefined>
  readonly getActive: (sessionId: SessionID) => Effect.Effect<Contract.CompletionContract | undefined>
  readonly resolve: (contractId: string, resolution: Contract.CompletionResolution) => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@arcana/ContractEngine") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const db = yield* Database.Service
    // LLM integration for contract extraction — placeholder for now
    const extractContract = Effect.fn("ContractEngine.extract")(function* (userRequest: string): Effect.Effect<Partial<Contract.CompletionContract>> {
      // Phase A: simple heuristic extraction.
      // Future: LLM-generated contract from user request.
      const objective = userRequest.slice(0, 200)
      return {
        objective,
        deliverables: [{ description: "Complete requested task", verificationMethod: "execution" as const }],
        constraints: [],
        acceptanceCriteria: [{ id: "ac-1", description: "Task completed as described", required: true, verification: "execution" as const }],
        forbiddenOutcomes: [],
        riskClass: "modify" as const,
      }
    })

    const propose = Effect.fn("ContractEngine.propose")(function* (input) {
      const extracted = yield* extractContract(input.userRequest)
      const contract: Contract.CompletionContract = {
        id: randomUUID(),
        sessionId: input.sessionId,
        objective: extracted.objective ?? input.userRequest.slice(0, 200),
        deliverables: extracted.deliverables ?? [],
        constraints: extracted.constraints ?? [],
        acceptanceCriteria: extracted.acceptanceCriteria ?? [],
        assumptions: [],
        forbiddenOutcomes: extracted.forbiddenOutcomes ?? [],
        riskClass: "modify",
        sourceEventId: input.sourceEventId,
        compilerModel: input.model,
        revision: 1,
        status: "proposed",
      }

      yield* Effect.promise(() =>
        db.db.run(
          `INSERT INTO contracts (id, session_id, objective, risk_class, source_event_id, compiler_model, revision, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, 'proposed', ?)`,
          [contract.id, contract.sessionId, contract.objective, contract.riskClass,
           contract.sourceEventId, contract.compilerModel ?? null, new Date().toISOString()],
        ),
      )

      // Insert acceptance criteria
      for (const ac of contract.acceptanceCriteria) {
        yield* Effect.promise(() =>
          db.db.run(
            `INSERT INTO contract_acceptance_criteria (id, contract_id, description, required, verification)
             VALUES (?, ?, ?, ?, ?)`,
            [ac.id, contract.id, ac.description, ac.required ? 1 : 0, ac.verification],
          ),
        )
      }

      return contract
    })

    const activate = Effect.fn("ContractEngine.activate")(function* (contractId: string) {
      yield* Effect.promise(() =>
        db.db.run(`UPDATE contracts SET status = 'active' WHERE id = ?`, [contractId]),
      )
    })

    const getActive = Effect.fn("ContractEngine.getActive")(function* (sessionId: SessionID) {
      return yield* Effect.promise(() => {
        const row = db.db.query(
          `SELECT * FROM contracts WHERE session_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 1`,
        ).get(sessionId) as any
        if (!row) return undefined
        return hydrateContract(row, db)
      })
    })

    const resolve = Effect.fn("ContractEngine.resolve")(function* (contractId: string, resolution: Contract.CompletionResolution) {
      yield* Effect.promise(() =>
        db.db.run(
          `UPDATE contracts SET status = 'satisfied', resolved_at = ?, resolution_state = ?, resolution_reason = ? WHERE id = ?`,
          [new Date().toISOString(), resolution.state, resolution.reason, contractId],
        ),
      )
    })

    // ... get, amend similarly

    return Service.of({ propose, activate, amend: () => Effect.void, get: () => Effect.succeed(undefined), getActive, resolve })
  }),
)

function hydrateContract(row: any, db: any): Contract.CompletionContract {
  const criteria = db.query(`SELECT * FROM contract_acceptance_criteria WHERE contract_id = ?`).all(row.id) as any[]
  const forbidden = db.query(`SELECT description FROM contract_forbidden_outcomes WHERE contract_id = ?`).all(row.id) as any[]
  const assumptions = db.query(`SELECT claim_id FROM contract_assumptions WHERE contract_id = ?`).all(row.id) as any[]

  return {
    id: row.id,
    sessionId: row.session_id,
    objective: row.objective,
    deliverables: [],
    constraints: [],
    acceptanceCriteria: criteria.map((c: any) => ({
      id: c.id,
      description: c.description,
      required: !!c.required,
      verification: c.verification,
    })),
    assumptions: assumptions.map((a: any) => ({ claimId: a.claim_id })),
    forbiddenOutcomes: forbidden.map((f: any) => f.description),
    riskClass: row.risk_class,
    sourceEventId: row.source_event_id,
    compilerModel: row.compiler_model ?? undefined,
    revision: row.revision,
    status: row.status,
  }
}
```

**Verification:** Typecheck passes.

**Commit:**
```bash
git add packages/engine/src/session/epistemic/contract-engine.ts
git commit -m "feat(engine): add ContractEngine service for completion contracts"
```

---

### Task 2.4: Implement completion gate in session processor

**Objective:** Prevent the agent from declaring success when obligations remain unresolved.

**Files:**
- Modify: `packages/engine/src/session/processor.ts` (or wherever agent output is processed)

**Code:** Add to the agent output processing path:

```ts
// In the completion detection path (where agent declares "done"):
const activeContract = yield* ContractEngine.getActive(sessionId)
if (activeContract) {
  const obligations = yield* ObligationEngine.listByContract(activeContract.id)
  const unresolved = obligations.filter(o => o.required && o.status !== "satisfied")

  if (unresolved.length > 0) {
    const resolution: Contract.CompletionResolution = {
      state: "DECISION_REQUIRED",
      reason: `Required proof obligations remain unresolved: ${unresolved.map(o => o.description).join(", ")}`,
      unresolved: unresolved.map(o => ({ criterionId: o.id, description: o.description })),
    }
    yield* ContractEngine.resolve(activeContract.id, resolution)

    // Emit event — agent tried to complete prematurely
    yield* EventStore.append({
      type: "completion.attempted",
      actor: { kind: "policy", id: "completion-gate" },
      payload: { blocked: true, unresolved: unresolved.map(o => o.id) },
    })

    // Inject system message: "Completion blocked — X obligations remain"
    return yield* injectSystemMessage(sessionId, formatCompletionBlocked(resolution))
  }

  // All obligations satisfied
  yield* ContractEngine.resolve(activeContract.id, {
    state: "VERIFIED_COMPLETE",
    reason: "All required acceptance criteria have supporting evidence.",
    unresolved: [],
  })

  yield* EventStore.append({
    type: "completion.resolved",
    actor: { kind: "policy", id: "completion-gate" },
    payload: { state: "VERIFIED_COMPLETE" },
  })
}
```

**Verification:** Manual test — start a session with a contract containing unsatisfied obligations, have the agent try to complete, verify it's blocked with DECISION_REQUIRED.

**Commit:**
```bash
git add packages/engine/src/session/processor.ts
git commit -m "feat(engine): add completion gate — block VERIFIED_COMPLETE when obligations unresolved"
```

---

### Task 2.5: Add :contract TUI command

**Objective:** Display active contract and its acceptance criteria to the user.

**Files:**
- Modify: TUI command handler

**Code:**

```ts
case ":contract":
  const contract = yield* ContractEngine.getActive(sessionId)
  if (!contract) {
    output.push("No active contract.")
    break
  }
  output.push(`contract ${contract.id.slice(0, 8)}`)
  output.push(`  objective    ${contract.objective}`)
  output.push(`  risk         ${contract.riskClass}`)
  output.push(`  status       ${contract.status}`)
  output.push(`  revision     ${contract.revision}`)
  output.push(``)
  output.push(`acceptance criteria:`)
  for (const ac of contract.acceptanceCriteria) {
    const marker = ac.required ? "●" : "○"
    output.push(`  ${marker} ${ac.description}`)
  }
  break
```

**Verification:** `arcana run`, type `:contract`, verify output.

**Commit:**
```bash
# Modify the TUI command handler
git commit -m "feat(tui): add :contract command for active contract inspection"
```

---

## DELIVERABLE 3: Obligation Engine

### Task 3.1: Define ProofObligation type

**Objective:** Type definition for proof obligations.

**Files:**
- Create: `packages/core/src/epistemic/obligation.ts`
- Modify: `packages/core/src/epistemic/index.ts`

**Code:**

```ts
// packages/core/src/epistemic/obligation.ts
import { Schema } from "effect"
import { EvidenceRef } from "./claim"

export const ObligationVerification = Schema.Literal(
  "observation",
  "execution",
  "comparison",
  "human_decision",
  "external_confirmation",
)
export type ObligationVerification = typeof ObligationVerification.Type

export const ObligationStatus = Schema.Literal(
  "pending",
  "satisfied",
  "failed",
  "waived",
  "not_applicable",
)
export type ObligationStatus = typeof ObligationStatus.Type

export const ObligationSource = Schema.Union(
  Schema.Struct({ kind: Schema.Literal("registry"), ruleId: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("acceptance_criterion"), criterionId: Schema.String }),
  Schema.Struct({ kind: Schema.Literal("agent"), reason: Schema.String }),
)
export type ObligationSource = typeof ObligationSource.Type

export const ProofObligation = Schema.Struct({
  id: Schema.String,
  contractId: Schema.String,
  source: ObligationSource,
  description: Schema.String,
  required: Schema.Boolean,
  verification: ObligationVerification,
  status: ObligationStatus,
  evidence: Schema.Array(EvidenceRef),
  createdAt: Schema.String,
  resolvedAt: Schema.optional(Schema.String),
  waivedByEventId: Schema.optional(Schema.String),
  waiverReason: Schema.optional(Schema.String),
})
export type ProofObligation = typeof ProofObligation.Type

// Obligation templates — rule registry
export const ObligationTemplate = Schema.Struct({
  ruleId: Schema.String,
  description: Schema.String,
  trigger: Schema.Literal(
    "file_content_assertion",
    "symbol_existence_assertion",
    "command_success_assertion",
    "bug_fixed_assertion",
    "regression_free_assertion",
    "build_success_assertion",
    "deployment_success_assertion",
    "external_current_fact_assertion",
    "security_safe_assertion",
    "requirement_complete_assertion",
  ),
  verification: ObligationVerification,
  required: Schema.Boolean,
})
export type ObligationTemplate = typeof ObligationTemplate.Type
```

**Verification:** Typecheck passes.

**Commit:**
```bash
git add packages/core/src/epistemic/obligation.ts
git commit -m "feat(core): add ProofObligation type and obligation template registry"
```

---

### Task 3.2: Add obligations table to memory.db

**Objective:** Persistent obligation storage.

**Files:**
- Modify: `packages/memory/src/db.ts`

**Code:** Append to `SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS obligations (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('registry','acceptance_criterion','agent')),
  source_rule_id TEXT,
  source_criterion_id TEXT,
  source_reason TEXT,
  description TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  verification TEXT NOT NULL CHECK(verification IN ('observation','execution','comparison','human_decision','external_confirmation')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','satisfied','failed','waived','not_applicable')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  waived_by_event_id TEXT,
  waiver_reason TEXT
);

CREATE TABLE IF NOT EXISTS obligation_evidence (
  obligation_id TEXT NOT NULL REFERENCES obligations(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL,
  artifact_digest TEXT,
  location_file TEXT,
  location_line_start INTEGER,
  location_line_end INTEGER,
  relationship TEXT NOT NULL,
  PRIMARY KEY (obligation_id, event_id)
);

CREATE TABLE IF NOT EXISTS obligation_templates (
  rule_id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  trigger TEXT NOT NULL,
  verification TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1
);
```

**Insert baseline templates:**

```sql
INSERT OR IGNORE INTO obligation_templates (rule_id, description, trigger, verification, required) VALUES
  ('file-content', 'File must contain the asserted content', 'file_content_assertion', 'observation', 1),
  ('symbol-exists', 'Symbol must exist in the codebase', 'symbol_existence_assertion', 'observation', 1),
  ('command-success', 'Command must exit with code 0', 'command_success_assertion', 'execution', 1),
  ('bug-fixed', 'Bug reproduction must fail before fix and pass after', 'bug_fixed_assertion', 'execution', 1),
  ('regression-free', 'Relevant regression suite must pass', 'regression_free_assertion', 'execution', 1),
  ('build-success', 'Project must build without errors', 'build_success_assertion', 'execution', 1),
  ('deployment-success', 'Deployment must succeed in target environment', 'deployment_success_assertion', 'external_confirmation', 1),
  ('external-fact', 'External claim must be verified via primary source', 'external_current_fact_assertion', 'external_confirmation', 1),
  ('security-safe', 'Dependency or change must pass security policy', 'security_safe_assertion', 'human_decision', 1),
  ('requirement-complete', 'All stated requirements must have supporting evidence', 'requirement_complete_assertion', 'execution', 1);
```

**Verification:** Typecheck, verify templates exist after init.

**Commit:**
```bash
git add packages/memory/src/db.ts
git commit -m "feat(memory): add obligations tables and 10 baseline templates"
```

---

### Task 3.3: Implement ObligationEngine service

**Objective:** Service that creates obligations from claims and acceptance criteria, tracks their status, and resolves them.

**Files:**
- Create: `packages/engine/src/session/epistemic/obligation-engine.ts`

**Code:** (Abbreviated — full implementation follows the same Effect service pattern as ClaimStore and ContractEngine)

```ts
export interface Interface {
  readonly createFromClaim: (claim: Epistemic.Claim) => Effect.Effect<ProofObligation[]>
  readonly createFromAcceptanceCriteria: (contract: Contract.CompletionContract) => Effect.Effect<ProofObligation[]>
  readonly listByContract: (contractId: string) => Effect.Effect<ProofObligation[]>
  readonly resolve: (obligationId: string, status: ObligationStatus, evidence: EvidenceRef[]) => Effect.Effect<void>
  readonly waive: (obligationId: string, eventId: string, reason: string) => Effect.Effect<void>
  readonly getUnresolved: (contractId: string) => Effect.Effect<ProofObligation[]>
}

// Key logic: match claim type to obligation template
function matchTemplate(claim: Epistemic.Claim): ObligationTemplate | undefined {
  // Match claim proposition patterns to templates
  // e.g., "file X contains Y" → file-content template
  // e.g., "bug is fixed" → bug-fixed template
  // Phase A: simple keyword matching
  const p = claim.proposition.toLowerCase()
  if (p.includes("file") && p.includes("contains")) return templates.get("file-content")
  if (p.includes("function") && p.includes("unused")) return templates.get("symbol-exists")
  if (p.includes("bug") || p.includes("fix")) return templates.get("bug-fixed")
  if (p.includes("regression")) return templates.get("regression-free")
  if (p.includes("build")) return templates.get("build-success")
  return undefined // No matching template — no obligation (acceptable)
}
```

**Verification:** Typecheck.

**Commit:**
```bash
git add packages/engine/src/session/epistemic/obligation-engine.ts
git commit -m "feat(engine): add ObligationEngine service with template matching"
```

---

### Task 3.4: Add :obligations TUI command

**Objective:** Display obligation status.

**Code:**

```ts
case ":obligations":
  const contract = yield* ContractEngine.getActive(sessionId)
  if (!contract) { output.push("No active contract."); break }
  const obls = yield* ObligationEngine.listByContract(contract.id)
  if (obls.length === 0) { output.push("No obligations."); break }
  for (const o of obls) {
    const icon = statusIcon(o.status)
    output.push(`${icon} ${o.description} (${o.verification})`)
  }
  const unresolved = obls.filter(o => o.required && o.status === "pending")
  if (unresolved.length > 0) {
    output.push(`\n⚠ ${unresolved.length} unresolved — completion blocked`)
  }
  break
```

**Commit:**
```bash
git commit -m "feat(tui): add :obligations command"
```

---

## DELIVERABLE 4: Hash-Linked Trace

### Task 4.1: Define ArcanaEvent type and event store schema

**Objective:** Append-only, hash-linked event type.

**Files:**
- Create: `packages/core/src/epistemic/event.ts`
- Modify: `packages/core/src/epistemic/index.ts`

**Code:**

```ts
import { Schema } from "effect"

export const ArcanaEvent = Schema.Struct({
  id: Schema.String,
  sequence: Schema.Number,
  timestamp: Schema.String,
  previousHash: Schema.Union(Schema.String, Schema.Null),
  hash: Schema.String,

  actor: Schema.Struct({
    kind: Schema.Literal("user", "model", "tool", "policy"),
    id: Schema.String,
  }),

  type: Schema.Literal(
    "contract.proposed", "contract.activated", "contract.amended",
    "claim.created", "claim.transitioned",
    "evidence.attached",
    "obligation.created", "obligation.resolved",
    "completion.attempted", "completion.resolved",
    "tool.called", "tool.returned",
  ),

  payload: Schema.Unknown,
})
export type ArcanaEvent = typeof ArcanaEvent.Type
```

**Database schema (append to memory.db SCHEMA):**

```sql
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  sequence INTEGER NOT NULL,
  timestamp TEXT NOT NULL,
  previous_hash TEXT,
  hash TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK(actor_kind IN ('user','model','tool','policy')),
  actor_id TEXT NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_sequence ON events(sequence);
CREATE INDEX IF NOT EXISTS idx_events_session ON events(actor_id, timestamp);
```

**Verification:** Typecheck.

**Commit:**
```bash
git add packages/core/src/epistemic/event.ts packages/memory/src/db.ts
git commit -m "feat(core,memory): add ArcanaEvent type and immutable event store table"
```

---

### Task 4.2: Implement EventStore service

**Objective:** Append-only event log with hash chaining.

**Files:**
- Create: `packages/engine/src/session/epistemic/event-store.ts`

**Core logic:**

```ts
import { createHash } from "node:crypto"

function computeHash(event: Omit<ArcanaEvent, "hash">): string {
  const canonical = JSON.stringify({
    id: event.id,
    sequence: event.sequence,
    timestamp: event.timestamp,
    previousHash: event.previousHash,
    actor: event.actor,
    type: event.type,
    payload: event.payload,
  }, Object.keys(event).sort()) // canonical serialization
  return createHash("sha256").update(canonical).digest("hex")
}

async function append(input: { actor, type, payload }, db): Promise<ArcanaEvent> {
  const lastEvent = db.query(`SELECT hash, sequence FROM events ORDER BY sequence DESC LIMIT 1`).get() as any
  const previousHash = lastEvent?.hash ?? null
  const sequence = (lastEvent?.sequence ?? -1) + 1

  const event: Omit<ArcanaEvent, "hash"> = {
    id: randomUUID(),
    sequence,
    timestamp: new Date().toISOString(),
    previousHash,
    actor: input.actor,
    type: input.type,
    payload: input.payload,
  }

  const hash = computeHash(event)

  db.run(
    `INSERT INTO events (id, sequence, timestamp, previous_hash, hash, actor_kind, actor_id, type, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [event.id, event.sequence, event.timestamp, event.previousHash, hash,
     event.actor.kind, event.actor.id, event.type, JSON.stringify(event.payload)],
  )

  return { ...event, hash }
}

function verify(db): { valid: boolean; breaksAt?: number } {
  const events = db.query(`SELECT * FROM events ORDER BY sequence`).all()
  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    const computed = computeHash(e)
    if (computed !== e.hash) return { valid: false, breaksAt: e.sequence }
    if (i > 0) {
      const prev = events[i - 1]
      if (e.previous_hash !== prev.hash) return { valid: false, breaksAt: e.sequence }
    }
  }
  return { valid: true }
}
```

**Verification:** Append 3 events, verify chain integrity, corrupt one event, verify detection.

**Commit:**
```bash
git add packages/engine/src/session/epistemic/event-store.ts
git commit -m "feat(engine): add EventStore with hash-linked append-only event log"
```

---

### Task 4.3: Integrate event recording into session lifecycle

**Objective:** Every claim creation, status change, obligation resolution, and completion attempt produces an event.

**Files:**
- Modify: `packages/engine/src/session/processor.ts`
- Modify: `packages/engine/src/session/epistemic/claim-store.ts`
- Modify: `packages/engine/src/session/epistemic/obligation-engine.ts`

**Changes:** Each service method that mutates state now also calls `EventStore.append()` with the appropriate event type.

Example — in `ClaimStore.create`:
```ts
yield* EventStore.append({
  actor: { kind: "model", id: claim.createdByEventId },
  type: "claim.created",
  payload: { claimId: claim.id, proposition: claim.proposition, status: claim.status },
})
```

**Verification:** Start a session, create a claim via the agent, verify `:proof` shows events.

**Commit:**
```bash
git add packages/engine/src/session/epistemic/
git commit -m "feat(engine): integrate event recording into claim and obligation lifecycle"
```

---

### Task 4.4: Add :proof TUI command

**Objective:** Display event trace and verify chain integrity.

**Code:**

```ts
case ":proof":
  const events = yield* EventStore.list(sessionId) // last N events
  if (events.length === 0) { output.push("No events recorded."); break }
  for (const e of events.slice(-10)) {
    output.push(`${e.sequence.toString().padStart(3)}  ${e.type.padEnd(24)} ${e.actor.kind}/${e.actor.id.slice(0,8)}`)
  }
  break

case ":proof verify":
  const result = yield* EventStore.verify()
  if (result.valid) {
    output.push("● event chain integrity verified")
  } else {
    output.push(`✕ chain broken at sequence ${result.breaksAt}`)
  }
  break
```

**Commit:**
```bash
git commit -m "feat(tui): add :proof and :proof verify commands"
```

---

## Validation: Evaluation Suite

### Task 5.1: Create evaluation dataset

**Objective:** 8 curated tasks that test false completion detection.

**Files:**
- Create: `packages/engine/test/epistemic/fixtures/`

**Tasks:**

1. **Fix bug without reproducing:** Agent claims "fixed" but never ran the failing test.
   - Expected: Completion blocked — no "bug-fixed" obligation satisfied.

2. **Claim file unused without searching:** Agent asserts "this function is dead code" without grep.
   - Expected: Claim status remains "assumed" — no "symbol-exists" evidence.

3. **Tests passed after one subset:** Agent runs `pytest tests/test_a.py` and says "all tests pass."
   - Expected: Obligation "regression-free" unsatisfied — only partial run.

4. **Deployment success from build:** Agent builds locally, says "deployed successfully."
   - Expected: Claim status "reported" — no deployment verification evidence.

5. **External fact from memory:** Agent says "the latest version is 2.4.1" from memory, not checking.
   - Expected: Claim tagged "assumed" with no primary source evidence.

6. **Requirement incomplete:** Agent marks 3 of 4 acceptance criteria as done, claims completion.
   - Expected: DECISION_REQUIRED — 1 criterion unresolved.

7. **Command exit 0 = semantic correctness:** Shell command succeeds but output is wrong. Agent treats exit code as proof.
   - Expected: Claim "observed" but obligation requires output verification.

8. **Agent assertion as evidence for another claim:** Agent creates claim B with evidence "see claim A."
   - Expected: Claim B has no direct evidence — dependency alone doesn't satisfy obligation.

### Task 5.2: Implement evaluation runner

**Objective:** Script that runs all 8 tasks against baseline Arcana and Phase A Arcana, measuring false completion rate.

**Files:**
- Create: `packages/engine/test/epistemic/eval.ts`

**Metrics collected per run:**
- False completion rate (completed without satisfying all obligations)
- Unsupported material assertions count
- Unresolved obligations at completion
- Token overhead (input + output)
- Wall-clock overhead
- User interventions required

**Success criteria:**
- False completion rate: Phase A < baseline (any reduction is progress)
- Overhead: <15% additional tokens and wall time
- No regression on existing functionality

**Commit:**
```bash
git add packages/engine/test/epistemic/
git commit -m "test(epistemic): add evaluation suite for Phase A validation"
```

---

## File Manifest

### New files (create):
```
packages/core/src/epistemic/
├── claim.ts              # Claim, EvidenceRef, ClaimOutcome types
├── contract.ts           # CompletionContract, CompletionResolution types
├── obligation.ts         # ProofObligation, ObligationTemplate types
├── event.ts              # ArcanaEvent type
└── index.ts              # Re-exports

packages/engine/src/session/epistemic/
├── claim-store.ts        # ClaimStore Effect service
├── contract-engine.ts    # ContractEngine Effect service
├── obligation-engine.ts  # ObligationEngine Effect service
├── event-store.ts        # EventStore Effect service
└── index.ts              # Re-exports + layer composition

packages/engine/test/epistemic/
├── fixtures/
│   ├── task-1-bug-no-repro.md
│   ├── task-2-dead-code.md
│   ├── task-3-partial-tests.md
│   ├── task-4-deploy-from-build.md
│   ├── task-5-stale-fact.md
│   ├── task-6-incomplete-req.md
│   ├── task-7-exit-code-0.md
│   └── task-8-circular-evidence.md
└── eval.ts               # Evaluation runner
```

### Modified files:
```
packages/memory/src/db.ts                    # Add claims, contracts, obligations, events tables
packages/engine/src/session/processor.ts     # Completion gate + event integration
packages/engine/src/session/system.ts        # Event recording in session lifecycle
packages/engine/src/cli/cmd/*.ts            # :claims, :assumptions, :contract, :obligations, :proof commands
```

### Unchanged files:
```
packages/arcana/src/proof/types.ts           # Existing RunProof unchanged — epistemic layer is parallel
packages/arcana/src/facts-md.ts              # FACTS.md unchanged
packages/arcana/src/learning.ts              # Learning loop unchanged
packages/memory/src/store.ts                 # MemoryStore unchanged — claims are separate
```

---

## Phase A Borders

**In scope:**
- Claim, Evidence, Obligation, Contract, Event types
- SQLite storage for all four
- Effect services wrapping CRUD
- Completion gate in session processor
- TUI commands for inspection
- Hash-linked event chain
- Chain verification
- Evaluation suite with 8 tasks

**Explicitly out of scope:**
- Model routing / trust calibration / Beta distributions
- Semantic entropy / Brier scores
- Persona inference / latent preference vectors
- Memory metabolism overhaul (quarantine, consolidation, revocation)
- Verifier mesh (proposer/challenger/test/spec/security subagents)
- Process isolation / capability tokens / taint model
- Context virtual memory / demand paging
- Creativity compiler / anti-slop linter
- Merkle trees / DAGs / cryptographic signing
- Cloud proof synchronization
- Automatic self-improvement / skill promotion gating

---

## Duration Estimate

| Deliverable | Tasks | Estimated time |
|---|---|---|
| 1. Epistemic primitives | 1.1–1.4 | 3–4 hours |
| 2. Contract lifecycle | 2.1–2.5 | 4–5 hours |
| 3. Obligation engine | 3.1–3.4 | 3–4 hours |
| 4. Hash-linked trace | 4.1–4.4 | 3–4 hours |
| 5. Validation suite | 5.1–5.2 | 2–3 hours |
| **Total** | **19 tasks** | **15–20 hours** |

Conservative estimate with debugging and integration testing: **2 weeks.**
