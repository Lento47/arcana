import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { normalizeRunProof } from "./compat.js"
import { createRunProof } from "./create.js"
import { evaluateFileMutationPolicy, evaluateShellCommandPolicy, ProofManager } from "./proof-manager.js"
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

  test("renders consensus evidence in terminal and markdown proof exports", () => {
    const manager = ProofManager.create({
      user_intent: "Compare migration strategies",
      cwd: process.cwd(),
    })

    manager.recordEvent({
      type: "consensus.recorded",
      actor: "agent",
      summary: "Consensus completed with winner arcana/architect.",
      refs: {
        council_id: "council_1",
        winner_model: "arcana/architect",
      },
      data: {
        prompt: "compare migration strategies",
        models: ["arcana/architect", "arcana/verifier"],
        rounds: 2,
        vote_mode: "majority",
        status: "completed",
        vote_tally: {
          "arcana/architect": 2,
          "arcana/verifier": 1,
        },
        cost_tokens: {
          input: 120,
          output: 80,
        },
        errored: [],
      },
    })

    const terminal = manager.renderTerminal()
    const markdown = manager.renderMarkdown()

    expect(terminal).toContain("Consensus Evidence")
    expect(terminal).toContain("ledger=council_1")
    expect(terminal).toContain("winner=arcana/architect")
    expect(terminal).toContain("votes=arcana/architect:2, arcana/verifier:1")
    expect(terminal).toContain("tokens=120 in / 80 out")
    expect(markdown).toContain("## Consensus Evidence")
    expect(markdown).toContain("Ledger: council_1")
    expect(markdown).toContain("Winner: arcana/architect")
    expect(markdown).toContain("Votes: arcana/architect:2, arcana/verifier:1")
    expect(markdown).toContain("Tokens: 120 in / 80 out")
  })

  test("stages rollback restore behind explicit approval", () => {
    const manager = ProofManager.create({
      user_intent: "Stage rollback without executing it",
      contract: {
        rollback_plan: "Restore from git checkpoint.",
      },
    })

    manager.updateRollback({
      strategy: "git_worktree",
      checkpoint_id: "HEAD",
      restore_command: "git restore --source HEAD --staged --worktree .",
    })
    manager.stageRollbackRestore()

    expect(manager.proof.rollback.restore_status).toBe("staged")
    expect(manager.proof.rollback.approval_required).toBe(true)
    expect(typeof manager.proof.rollback.staged_at).toBe("string")
    expect(manager.proof.risk.level).toBe("high")
    expect(manager.proof.risk.required_approval).toBe(true)
    expect(manager.proof.contract.required_approvals).toContain("rollback restore execution")
    expect(manager.proof.events.map((event) => event.type)).toContain("rollback.staged")

    const markdown = manager.renderMarkdown()
    const rendered = renderRunProofMarkdown(manager.proof)
    expect(markdown).toContain("Restore approval: required before execution")
    expect(rendered).toContain("Restore status: staged")
  })

  test("captures rollback restore approval without execution", () => {
    const manager = ProofManager.create({
      user_intent: "Approve rollback restore without running it",
      contract: {
        rollback_plan: "Restore from git checkpoint.",
      },
    })

    manager.updateRollback({
      strategy: "git_worktree",
      checkpoint_id: "HEAD",
      restore_command: "git restore --source HEAD --staged --worktree .",
    })
    manager.stageRollbackRestore()
    manager.approveRollbackRestore({ approved_by: "test-operator" })

    expect(manager.proof.rollback.restore_status).toBe("approved")
    expect(manager.proof.rollback.approval_required).toBe(false)
    expect(typeof manager.proof.rollback.approved_at).toBe("string")
    expect(manager.proof.rollback.approved_by).toBe("test-operator")
    expect(manager.proof.events.map((event) => event.type)).toContain("rollback.approved")
    expect(manager.proof.execution.shell_commands.map((command) => command.command)).not.toContain(
      "git restore --source HEAD --staged --worktree .",
    )

    const rendered = renderRunProofMarkdown(manager.proof)
    expect(rendered).toContain("Restore status: approved")
    expect(rendered).toContain("Approved by: test-operator")
  })

  test("records rollback restore execution only after approval", () => {
    const manager = ProofManager.create({
      user_intent: "Record approved rollback execution evidence",
      cwd: process.cwd(),
      contract: {
        rollback_plan: "Restore from git checkpoint.",
      },
    })

    manager.updateRollback({
      strategy: "git_worktree",
      checkpoint_id: "HEAD",
      restore_command: "git restore --source HEAD --staged --worktree .",
    })
    expect(() =>
      manager.recordRollbackRestoreExecution({
        cwd: process.cwd(),
        status: "passed",
        exit_code: 0,
      }),
    ).toThrow("Rollback restore must be approved before execution can be recorded.")

    manager.stageRollbackRestore()
    manager.approveRollbackRestore({ approved_by: "test-operator" })
    manager.recordRollbackRestoreExecution({
      cwd: process.cwd(),
      status: "passed",
      exit_code: 0,
      stdout_summary: "restored worktree",
    })

    expect(manager.proof.rollback.restore_status).toBe("executed")
    expect(manager.proof.rollback.execution_status).toBe("passed")
    expect(manager.proof.rollback.execution_exit_code).toBe(0)
    expect(manager.proof.lifecycle.status).toBe("rolled_back")
    expect(manager.proof.events.map((event) => event.type)).toContain("rollback.executed")
    expect(manager.proof.execution.shell_commands.map((command) => command.command)).toContain(
      "git restore --source HEAD --staged --worktree .",
    )

    const rendered = renderRunProofMarkdown(manager.proof)
    expect(rendered).toContain("Restore status: executed")
    expect(rendered).toContain("Execution status: passed")
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

  test("gates file mutations before write tools run", () => {
    const manager = ProofManager.create({
      user_intent: "Classify file mutation gates",
      cwd: process.cwd(),
    })

    const sourceDecision = manager.gateFileMutation("packages/tui/src/app.tsx", { operation: "edit" })
    const lockfileDecision = manager.gateFileMutation("pnpm-lock.yaml", { operation: "write" })
    const secretDecision = evaluateFileMutationPolicy(".env.production", { operation: "write" })
    const approvedDecision = evaluateFileMutationPolicy("packages/arcana/src/auth/session.ts", {
      operation: "edit",
      approved: true,
    })
    const markdown = manager.renderMarkdown()

    expect(sourceDecision.risk).toBe("medium")
    expect(sourceDecision.blocked).toBe(false)
    expect(lockfileDecision.risk).toBe("high")
    expect(lockfileDecision.required_approval).toBe(true)
    expect(lockfileDecision.blocked).toBe(true)
    expect(secretDecision.risk).toBe("critical")
    expect(secretDecision.blocked).toBe(true)
    expect(approvedDecision.required_approval).toBe(true)
    expect(approvedDecision.blocked).toBe(false)
    expect(manager.proof.risk.required_approval).toBe(true)
    expect(manager.proof.contract.required_approvals).toContain("file mutation policy gate")
    expect(manager.proof.events.map((event) => event.type)).toContain("approval.required")
    expect(markdown).toContain("File mutation blocked pending approval")
  })

  test("records context access as proof evidence", () => {
    const manager = ProofManager.create({
      user_intent: "Track context accessed by the agent",
      cwd: process.cwd(),
    })

    manager.recordContextAccess({
      tool: "read",
      path: "packages/arcana/src/proof/types.ts",
      summary: "Read file context: packages/arcana/src/proof/types.ts",
      exists: true,
      bytes_read: 1200,
    })
    manager.recordContextAccess({
      tool: "grep",
      path: "packages/arcana/src",
      pattern: "RunProof",
      summary: "Searched context: RunProof",
      exists: true,
      result_count: 7,
    })
    const markdown = manager.renderMarkdown()

    expect(manager.proof.execution.file_reads).toHaveLength(2)
    expect(manager.proof.events.map((event) => event.type)).toContain("context.accessed")
    expect(manager.proof.events.find((event) => event.type === "context.accessed")?.refs?.tool).toBe("read")
    expect(markdown).toContain("## Context Access")
    expect(markdown).toContain("packages/arcana/src/proof/types.ts")
  })

  test("records file writes as proof evidence", () => {
    const manager = ProofManager.create({
      user_intent: "Track files mutated by the agent",
      cwd: process.cwd(),
    })

    manager.recordFileWrite({
      path: "packages/arcana/src/proof/render.ts",
      mode: "proposed",
      reason: "edit tool modified packages/arcana/src/proof/render.ts",
      bytes_written: 42,
    })
    const markdown = manager.renderMarkdown()

    expect(manager.proof.execution.file_writes).toHaveLength(1)
    expect(manager.proof.events.map((event) => event.type)).toContain("file.written")
    expect(manager.proof.events.find((event) => event.type === "file.written")?.refs?.path).toBe(
      "packages/arcana/src/proof/render.ts",
    )
    expect(markdown).toContain("## File Writes")
    expect(markdown).toContain("packages/arcana/src/proof/render.ts")
  })

  test("caps completion evidence when file writes have no passing verification", () => {
    const manager = ProofManager.create({
      user_intent: "Complete after a file mutation",
      cwd: process.cwd(),
    })

    manager.recordFileWrite({
      path: "src/app.ts",
      mode: "proposed",
      reason: "write tool changed src/app.ts",
    })
    manager.finalize({
      status: "completed",
      summary: "Finished without verification.",
      evidence: { proof_score: 90, human_review_recommended: false },
    })

    expect(manager.proof.final_evidence.proof_score).toBe(40)
    expect(manager.proof.final_evidence.human_review_recommended).toBe(true)
    expect(manager.proof.unresolved.skipped_tests).toContain(
      "Completion has file write evidence but no passing verification evidence.",
    )
    expect(manager.proof.events.map((event) => event.type)).toContain("verification.failed")
  })

  test("keeps completion evidence when file writes have passing verification", () => {
    const manager = ProofManager.create({
      user_intent: "Complete after verified file mutation",
      cwd: process.cwd(),
    })

    manager.recordFileWrite({
      path: "src/app.ts",
      mode: "proposed",
      reason: "write tool changed src/app.ts",
    })
    manager.setTypecheck({
      command: "bun run typecheck",
      status: "passed",
      summary: "Typecheck passed.",
    })
    manager.finalize({
      status: "completed",
      summary: "Finished with verification.",
      evidence: { proof_score: 90, human_review_recommended: false },
    })

    expect(manager.proof.final_evidence.proof_score).toBe(90)
    expect(manager.proof.final_evidence.human_review_recommended).toBe(false)
    expect(manager.proof.unresolved.skipped_tests).not.toContain(
      "Completion has file write evidence but no passing verification evidence.",
    )
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

  test("shell command gate includes ML tool signal evidence", () => {
    const manager = ProofManager.create({
      user_intent: "Classify shell policy gates with ML signals",
      cwd: process.cwd(),
    })

    manager.gateShellCommand("curl -s https://example.com/data.json", {
      approved: false,
      sandboxEnabled: false,
    })

    const gateEvent = manager.proof.events.find((event) => event.data?.action === "shell_command")
    expect(gateEvent).toBeDefined()
    const data = gateEvent?.data as
      | { ml_signal?: { labels: string[]; confidence: number }; ml_decision?: { action: string } }
      | undefined
    expect(data?.ml_signal).toBeDefined()
    expect(data?.ml_decision).toBeDefined()
    expect(Array.isArray(data?.ml_signal?.labels)).toBe(true)
    expect(typeof data?.ml_signal?.confidence).toBe("number")
    expect(typeof data?.ml_decision?.action).toBe("string")
  })

  test("file mutation gate combines static and ML risk", () => {
    const manager = ProofManager.create({
      user_intent: "Classify file mutation gates with ML signals",
      cwd: process.cwd(),
    })

    const decision = manager.gateFileMutation("packages/arcana/src/auth/session.ts", {
      operation: "edit",
      approved: false,
      sandboxEnabled: false,
    })

    expect(["medium", "high"]).toContain(decision.risk)
    expect(manager.proof.events.some((event) => event.data?.action === "file_mutation")).toBe(true)
    const gateEvent = manager.proof.events.find((event) => event.data?.action === "file_mutation")
    const data = gateEvent?.data as { ml_signal?: unknown; ml_decision?: unknown } | undefined
    expect(data?.ml_signal).toBeDefined()
    expect(data?.ml_decision).toBeDefined()
  })

  test("records ML signal events", () => {
    const manager = ProofManager.create({
      user_intent: "Record ML turn signal",
      cwd: process.cwd(),
    })

    manager.recordMlSignal({
      kind: "turn",
      signal: {
        kind: "turn",
        intent: "code_edit",
        risk: "medium",
        executionPosture: "assist",
        modelRoute: { profile: "code", reason: "Code task detected." },
        confidence: { value: 0.72, reasons: ["Intent matched."] },
        needs: { sandbox: true, approval: false, web: false, memory: false },
        labels: ["code"],
        reasons: ["Prompt references code, files, or repository work."],
      },
      refs: { intent: "code_edit" },
    })

    expect(manager.proof.events.map((event) => event.type)).toContain("ml.signal")
    const signalEvent = manager.proof.events.find((event) => event.type === "ml.signal")
    expect(signalEvent?.data?.kind).toBe("turn")
    expect(signalEvent?.refs?.intent).toBe("code_edit")
  })
})
