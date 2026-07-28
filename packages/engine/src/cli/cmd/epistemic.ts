import type { CommandModule } from "yargs"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { Database } from "bun:sqlite"
import { computeEventHash } from "@arcana/core/epistemic/event-hash"

// ── helpers ──────────────────────────────────────────────────────────

function getArcanaHome(): string {
  return process.env.ARCANA_HOME ?? join(homedir(), ".arcana")
}

function getDataDir(): string {
  const cp = join(getArcanaHome(), "config.json")
  if (existsSync(cp)) {
    try {
      const cfg = JSON.parse(readFileSync(cp, "utf8"))
      if (typeof cfg.dataDir === "string") return cfg.dataDir
    } catch {}
  }
  return join(getArcanaHome(), "data")
}

function openDB(): Database {
  const dbPath = join(getDataDir(), "memory.db")
  return new Database(dbPath, { readonly: true })
}

const STATUS_ICONS: Record<string, string> = {
  observed: "◆",
  derived: "◈",
  assumed: "◇",
  predicted: "◬",
  reported: "◉",
  contradicted: "✕",
  superseded: "◁",
  verified: "●",
  pending: "○",
  satisfied: "●",
  waived: "◌",
}

function statusIcon(s: string): string {
  return STATUS_ICONS[s] ?? "?"
}

// ── commands ─────────────────────────────────────────────────────────

export const claims: CommandModule = {
  command: "claims [session-id]",
  describe: "List epistemic claims for a session",
  builder: (yargs) =>
    yargs.positional("session-id", {
      describe: "Session ID to query",
      type: "string",
    }),
  handler: async (argv) => {
    const db = openDB()
    try {
      const sessionId = argv["session-id"] as string
      if (!sessionId) {
        console.log("Usage: arcana claims <session-id>")
        return
      }

      type ClaimRow = {
        id: string
        proposition: string
        status: string
        confidence: number | null
        scope_file: string | null
      }

      const rows = db
        .query("SELECT id, proposition, status, confidence, scope_file FROM claims WHERE session_id = ? ORDER BY rowid")
        .all(sessionId) as ClaimRow[]

      if (rows.length === 0) {
        console.log("No claims recorded for this session.")
        return
      }

      for (const c of rows) {
        const icon = statusIcon(c.status)
        const scope = c.scope_file ? ` (${c.scope_file})` : ""
        const conf = c.confidence != null ? ` [${(c.confidence * 100).toFixed(0)}%]` : ""
        console.log(`${icon} ${c.proposition.slice(0, 100)}${scope}${conf}`)
        console.log(`   id: ${c.id.slice(0, 8)}  status: ${c.status}`)
      }
      console.log(`\n${rows.length} claim(s)`)
    } finally {
      db.close()
    }
  },
}

export const assumptions: CommandModule = {
  command: "assumptions [session-id]",
  describe: "List unverified assumptions for a session",
  builder: (yargs) =>
    yargs.positional("session-id", {
      describe: "Session ID to query",
      type: "string",
    }),
  handler: async (argv) => {
    const db = openDB()
    try {
      const sessionId = argv["session-id"] as string
      if (!sessionId) {
        console.log("Usage: arcana assumptions <session-id>")
        return
      }

      type AssumptionRow = { id: string; proposition: string; status: string }

      const rows = db
        .query("SELECT id, proposition, status FROM claims WHERE session_id = ? AND status = 'assumed' ORDER BY rowid")
        .all(sessionId) as AssumptionRow[]

      if (rows.length === 0) {
        console.log("No unverified assumptions.")
        return
      }

      for (const a of rows) {
        console.log(`◇ ${a.proposition.slice(0, 100)}`)
      }
      console.log(`\n${rows.length} unverified assumption(s)`)
    } finally {
      db.close()
    }
  },
}

export const contract: CommandModule = {
  command: "contract [session-id]",
  describe: "Show active completion contract for a session",
  builder: (yargs) =>
    yargs.positional("session-id", {
      describe: "Session ID to query",
      type: "string",
    }),
  handler: async (argv) => {
    const db = openDB()
    try {
      const sessionId = argv["session-id"] as string
      if (!sessionId) {
        console.log("Usage: arcana contract <session-id>")
        return
      }

      type ContractRow = {
        id: string
        objective: string
        risk_class: string | null
        status: string
        revision: number
      }

      const row = db
        .query("SELECT id, objective, risk_class, status, revision FROM contracts WHERE session_id = ? AND status = 'active' LIMIT 1")
        .get(sessionId) as ContractRow | undefined

      if (!row) {
        console.log("No active contract.")
        return
      }

      console.log(`contract ${row.id.slice(0, 8)}`)
      console.log(`  objective    ${row.objective}`)
      console.log(`  risk         ${row.risk_class ?? "standard"}`)
      console.log(`  status       ${row.status}`)
      console.log(`  revision     ${row.revision}`)
      console.log()

      type CriteriaRow = { description: string; required: number; priority: string | null }
      const criteria = db
        .query("SELECT description, required, priority FROM contract_acceptance_criteria WHERE contract_id = ? ORDER BY COALESCE(priority, 'P2')")
        .all(row.id) as CriteriaRow[]

      if (criteria.length > 0) {
        console.log("acceptance criteria:")
        for (const ac of criteria) {
          const marker = ac.required ? "●" : "○"
          const prio = ac.priority ? ` [${ac.priority}]` : ""
          console.log(`  ${marker} ${ac.description}${prio}`)
        }
      }
    } finally {
      db.close()
    }
  },
}

export const obligations: CommandModule = {
  command: "obligations [session-id]",
  describe: "List proof obligations for a session's active contract",
  builder: (yargs) =>
    yargs.positional("session-id", {
      describe: "Session ID to query",
      type: "string",
    }),
  handler: async (argv) => {
    const db = openDB()
    try {
      const sessionId = argv["session-id"] as string
      if (!sessionId) {
        console.log("Usage: arcana obligations <session-id>")
        return
      }

      type ContractRow = { id: string }
      const contractRow = db
        .query("SELECT id FROM contracts WHERE session_id = ? AND status = 'active' LIMIT 1")
        .get(sessionId) as ContractRow | undefined

      if (!contractRow) {
        console.log("No active contract.")
        return
      }

      type ObligationRow = {
        id: string
        description: string
        status: string
        required: number
        verification: string | null
      }

      const rows = db
        .query("SELECT id, description, status, required, verification FROM obligations WHERE contract_id = ? ORDER BY required DESC, rowid")
        .all(contractRow.id) as ObligationRow[]

      if (rows.length === 0) {
        console.log("No obligations.")
        return
      }

      for (const o of rows) {
        const icon = statusIcon(o.status)
        const reqFlag = o.required ? " [required]" : ""
        const ver = o.verification ? ` (${o.verification})` : ""
        console.log(`${icon} ${o.description}${ver}${reqFlag}`)
      }

      const unresolved = rows.filter((o) => o.required && o.status !== "satisfied")
      if (unresolved.length > 0) {
        console.log(`\n⚠ ${unresolved.length} unresolved required — completion blocked`)
      } else {
        console.log("\n● all required obligations satisfied")
      }
    } finally {
      db.close()
    }
  },
}

export const proof: CommandModule = {
  command: "proof [session-id]",
  describe: "Show hash-linked event trace for a session",
  builder: (yargs) =>
    yargs
      .positional("session-id", {
        describe: "Session ID to query",
        type: "string",
      })
      .option("verify", {
        alias: "v",
        describe: "Verify hash chain integrity",
        type: "boolean",
        default: false,
      }),
  handler: async (argv) => {
    const db = openDB()
    try {
      const sessionId = argv["session-id"] as string
      if (!sessionId) {
        console.log("Usage: arcana proof <session-id> [--verify]")
        return
      }

      type EventRow = {
        id: string
        sequence: number
        type: string
        actor_kind: string
        actor_id: string
        hash: string
        previous_hash: string | null
        timestamp: string
        payload: string
      }

      const rows = db
        .query("SELECT id, sequence, type, actor_kind, actor_id, hash, previous_hash, timestamp, payload FROM events WHERE session_id = ? ORDER BY sequence")
        .all(sessionId) as EventRow[]

      if (rows.length === 0) {
        console.log("No events recorded.")
        return
      }

      // Show last 20 events
      const show = rows.slice(-20)
      for (const e of show) {
        const seq = String(e.sequence).padStart(3, " ")
        const type = e.type.padEnd(24, " ")
        const actor = `${e.actor_kind}/${e.actor_id.slice(0, 8)}`
        console.log(`${seq}  ${type} ${actor}`)
      }
      if (rows.length > 20) {
        console.log(`\n... ${rows.length - 20} more events`)
      }
      console.log(`\n${rows.length} total event(s)`)

      // Verify
      if (argv.verify) {
        // ── 1. Global chain integrity (all events in DB) ──────────────
        const allRows = db
          .query("SELECT id, sequence, type, actor_kind, actor_id, hash, previous_hash, timestamp, payload FROM events ORDER BY sequence")
          .all() as EventRow[]

        let globalValid = true
        let globalBreaksAt: number | undefined

        for (let i = 0; i < allRows.length; i++) {
          const e = allRows[i]
          const computed = computeEventHash({
            id: e.id, sequence: e.sequence, timestamp: e.timestamp, previousHash: e.previous_hash,
            actorKind: e.actor_kind, actorId: e.actor_id, type: e.type, payload: e.payload,
          })
          if (computed !== e.hash) {
            globalValid = false
            globalBreaksAt = e.sequence
            break
          }
          if (i > 0 && e.previous_hash !== allRows[i - 1].hash) {
            globalValid = false
            globalBreaksAt = e.sequence
            break
          }
        }

        console.log(globalValid
          ? `● global chain integrity verified (${allRows.length} events)`
          : `✕ global chain broken at sequence ${globalBreaksAt}`)

        // ── 2. Selected event integrity (session-filtered) ────────────
        let selectedValid = true
        let selectedBreaksAt: number | undefined

        for (const e of rows) {
          const computed = computeEventHash({
            id: e.id, sequence: e.sequence, timestamp: e.timestamp, previousHash: e.previous_hash,
            actorKind: e.actor_kind, actorId: e.actor_id, type: e.type, payload: e.payload,
          })
          if (computed !== e.hash) {
            selectedValid = false
            selectedBreaksAt = e.sequence
            break
          }
        }

        console.log(selectedValid
          ? `● selected event integrity verified (${rows.length} events)`
          : `✕ selected event hash mismatch at sequence ${selectedBreaksAt}`)

        // ── 3. Session membership binding (v1 limitation) ─────────────
        console.log("○ session membership binding: NOT PROTECTED IN EVENT V1")

        // ── 4. Session subset continuity ──────────────────────────────
        console.log("○ session subset continuity: NOT APPLICABLE — global chain")
      }
    } finally {
      db.close()
    }
  },
}

// ── parent command ───────────────────────────────────────────────────

export const EpistemicCommand: CommandModule = {
  command: "epistemic",
  describe: "Arcana epistemic layer — claims, contracts, obligations, proofs",
  builder: (yargs) =>
    yargs
      .command(claims)
      .command(assumptions)
      .command(contract)
      .command(obligations)
      .command(proof)
      .demandCommand(),
  handler: () => {},
}
