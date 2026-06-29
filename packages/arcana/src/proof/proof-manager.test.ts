import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { normalizeRunProof } from "./compat.js"
import { createRunProof } from "./create.js"
import { evaluateShellCommandPolicy, ProofManager } from "./proof-manager.js"
import { renderRunProofMarkdown } from "./render.js"
import { saveRunProof } from "./store.js"
import type { RunProof } from "./types.js"

describe("RunProof execution governance", () => {
  test("creates an active execution contract before action", () => {
    const proof = createRunProof({
      user_intent: "Update the TUI command registry",
      cwd: process.cwd(),
      contract: {
        allowed_files: ["packages/tui/src/app.tsx"],
        allowed_commands: ["bun --cwd packages/tui typecheck"],
        risk_level: "medium",
        required_approvals: ["dependency changes"],
        expected_artifacts: ["typed command registry diff", "typecheck evidence"],
        rollback_plan: "Restore the app.tsx patch from git.",
        verification_steps: ["Run TUI typecheck"],
      },
    })

    expect(proof.schema_version).toBe("0.2")
    expect(proof.contract.status).toBe("active")
    expect(proof.contract.goal).toBe("Update the TUI command registry")
    expect(proof.contract.allowed_files).toContain("packages/tui/src/app.tsx")
    expect(proof.events.map((event) => event.type)).toEqual(["plan.created", "approval.required"])
  })

  test("records live execution ledger events from manager actions", () => {
    const manager = ProofManager.create({
      user_intent: "Add proof-backed command surfaces",
      contract: {
        allowed_commands: ["bun test packages/arcana/src/proof/proof-manager.test.ts"],
        verification_steps: ["Run focused proof tests"],
      },
    })

    manager.updateRisk({
      level: "medium",
      reasons: ["Shell execution and file writes require evidence."],
      required_approval: true,
    })
    manager.recordToolCall({
      name: "apply_patch",
      status: "running",
      risk: "medium",
      input_summary: "Add execution contract and ledger fields.",
    })
    manager.recordShellCommand({
      command: "bun test packages/arcana/src/proof/proof-manager.test.ts",
      cwd: process.cwd(),
      status: "passed",
      risk: "low",
      exit_code: 0,
    })
    manager.addProposedDiff({
      path: "packages/arcana/src/proof/types.ts",
      additions: 40,
      deletions: 1,
      summary: "Add contract and event schema.",
    })
    manager.setTypecheck({
      command: "bun --cwd packages/arcana typecheck",
      status: "passed",
      summary: "Arcana package typecheck passed.",
    })
    manager.updateRollback({
      strategy: "git_worktree",
      checkpoint_id: "HEAD",
      restore_command: "git restore packages/arcana/src/proof",
    })

    expect(manager.proof.events.map((event) => event.type)).toEqual([
      "plan.created",
      "approval.required",
      "tool.requested",
      "command.executed",
      "diff.created",
      "verification.passed",
      "rollback.available",
    ])
    expect(manager.proof.final_evidence.commands_run).toContain(
      "bun test packages/arcana/src/proof/proof-manager.test.ts",
    )
  })

  test("saves a deterministic replay log next to proof artifacts", async () => {
    const dir = await mkdtemp(join(tmpdir(), "arcana-runproof-replay-"))
    const manager = ProofManager.create({
      user_intent: "Replay a governed agent run",
      cwd: dir,
      command: "arcana run --proof replay",
    })

    manager.updateRisk({
      level: "medium",
      reasons: ["Replay log should preserve execution order."],
      required_approval: false,
    })
    manager.recordShellCommand({
      command: "bun test",
      cwd: dir,
      status: "passed",
      risk: "low",
      exit_code: 0,
    })

    const stored = await saveRunProof(manager.proof, { cwd: dir, markdown: manager.renderMarkdown() })
    const replay = await readFile(stored.replay_path, "utf8")

    expect(stored.replay_path.endsWith(".replay.log")).toBe(true)
    expect(replay).toContain(`ARCANA RUNPROOF REPLAY ${manager.proof.id}`)
    expect(replay).toContain("plan.created")
    expect(replay).toContain("risk.evaluated")
    expect(replay).toContain("command.executed")
    expect(replay).toContain("command.reflected")
    expect(replay).toContain("rollback.strategy=none")
  })

  test("gates shell commands before execution", () => {
    const manager = ProofManager.create({
      user_intent: "Classify shell policy gates",
      cwd: process.cwd(),
    })

    const testDecision = manager.gateShellCommand("bun test packages/arcana/src/proof/proof-manager.test.ts")
    const destructiveDecision = manager.gateShellCommand("git reset --hard HEAD")
    const approvedDecision = evaluateShellCommandPolicy("pnpm install", { approved: true })
    const markdown = manager.renderMarkdown()

    expect(testDecision.risk).toBe("low")
    expect(testDecision.blocked).toBe(false)
    expect(destructiveDecision.risk).toBe("critical")
    expect(destructiveDecision.required_approval).toBe(true)
    expect(destructiveDecision.blocked).toBe(true)
    expect(approvedDecision.required_approval).toBe(true)
    expect(approvedDecision.blocked).toBe(false)
    expect(manager.proof.risk.required_approval).toBe(true)
    expect(manager.proof.contract.required_approvals).toContain("shell command policy gate")
    expect(manager.proof.events.map((event) => event.type)).toContain("approval.required")
    expect(markdown).toContain("## Policy Gates")
    expect(markdown).toContain("Shell command blocked pending approval")
  })

  test("normalizes legacy RunProof 0.1 records without contract or events", () => {
    const legacyProof = {
      id: "rp_legacy",
      schema_version: "0.1",
      timestamp: "2026-01-01T00:00:00.000Z",
      repo: {
        path: process.cwd(),
        dirty_before: false,
      },
      user_intent: "Legacy run",
      lifecycle: {
        status: "completed",
        started_at: "2026-01-01T00:00:00.000Z",
      },
      command_history: [],
      plan: {
        summary: "Legacy plan",
        steps: [],
        assumptions: [],
      },
      execution: {
        tool_calls: [],
        mcp_calls: [],
        file_reads: [{ id: "read_1", path: "README.md", timestamp: "2026-01-01T00:00:01.000Z", reason: "inspect" }],
        file_writes: [],
        shell_commands: [
          {
            id: "shell_1",
            command: "bun test",
            timestamp: "2026-01-01T00:00:02.000Z",
            cwd: process.cwd(),
            status: "passed",
            risk: "low",
            exit_code: 0,
          },
        ],
      },
      diffs: {
        proposed: [],
        applied: [],
        rejected: [],
      },
      verification: {
        diagnostics: [],
        tests: [],
        manual_checks: [],
      },
      risk: {
        level: "low",
        reasons: [],
        required_approval: false,
      },
      rollback: {
        checkpoint_id: "none",
        strategy: "none",
      },
      unresolved: {
        unverified_assumptions: [],
        skipped_tests: [],
        known_limitations: [],
      },
      final_evidence: {
        completed: true,
        summary: "Legacy complete",
        files_changed: [],
        commands_run: ["bun test"],
        proof_score: 80,
        human_review_recommended: false,
      },
    } as unknown as RunProof

    const normalized = normalizeRunProof(legacyProof)
    const markdown = renderRunProofMarkdown(legacyProof)

    expect(normalized.schema_version).toBe("0.2")
    expect(normalized.contract.goal).toBe("Legacy run")
    expect(normalized.contract.allowed_files).toContain("README.md")
    expect(normalized.events.map((event) => event.type)).toEqual(["plan.created", "command.executed"])
    expect(markdown).toContain("## Execution Contract")
    expect(markdown).toContain("## RunProof Timeline")
  })
})
