// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { describe, expect, test } from "bun:test"

import { createProofRuntime, parseArcanaSlashTask } from "./proof-runtime.js"

describe("ProofRuntime live evidence capture", () => {
  test("parses Arcana slash tasks without treating unknown slash commands as proof tasks", () => {
    expect(parseArcanaSlashTask("/contract refactor auth middleware")).toEqual({
      command: "contract",
      task: "refactor auth middleware",
      objective:
        "Compile the task into an execution contract first: goal, scope, allowed work, risk, approvals, artifacts, rollback, and verification.",
    })
    expect(parseArcanaSlashTask("/actions inspect timeline\nthen continue")?.task).toBe(
      "inspect timeline\nthen continue",
    )
    expect(parseArcanaSlashTask("/consensus compare migration strategies")?.objective).toContain(
      "consensus work packet",
    )
    expect(parseArcanaSlashTask("/unknown do work")).toBeUndefined()
    expect(parseArcanaSlashTask("/verify")).toBeUndefined()
  })

  test("records Arcana slash tasks as RunProof contract and ledger evidence", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arcana-proof-runtime-"))
    const previousActivePath = process.env.ARCANA_ACTIVE_RUNPROOF_PATH

    try {
      const runtime = await createProofRuntime({
        enabled: true,
        cwd,
        command: "arcana run --proof",
        prompt: "Interactive Arcana session",
      })

      await runtime.recordUserCommand("/contract upgrade auth dependency lockfile", "User turn accepted.")

      const activePath = runtime.activeProofPath()
      expect(activePath).toBeTruthy()
      const stored = JSON.parse(await readFile(activePath!, "utf8"))
      const proof = stored.proof ?? stored
      expect(proof.contract.goal).toBe("upgrade auth dependency lockfile")
      expect(proof.contract.scope).toBe("Arcana /contract governed task submitted by the operator.")
      expect(proof.contract.risk_level).toBe("high")
      expect(proof.contract.required_approvals).toContain("Arcana /contract task approval")
      expect(proof.plan.summary).toContain("/contract")
      expect(proof.events.map((event: { type: string }) => event.type)).toContain("approval.required")
      const arcanaEvent = proof.events.find(
        (event: { type: string; refs?: Record<string, string> }) =>
          event.type === "plan.created" && event.refs?.command === "/contract",
      )
      expect(arcanaEvent?.data.task).toBe("upgrade auth dependency lockfile")
      expect(arcanaEvent?.data.required_approval).toBe(true)
    } finally {
      if (previousActivePath === undefined) delete process.env.ARCANA_ACTIVE_RUNPROOF_PATH
      else process.env.ARCANA_ACTIVE_RUNPROOF_PATH = previousActivePath
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test("records agent turns and persists the active proof path", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arcana-proof-runtime-"))
    const previousActivePath = process.env.ARCANA_ACTIVE_RUNPROOF_PATH

    try {
      const runtime = await createProofRuntime({
        enabled: true,
        cwd,
        command: "arcana run --proof",
        prompt: "Refactor auth middleware",
      })

      await runtime.recordAgentTurn({
        input_summary: "Refactor auth middleware",
        output_summary: "Refactor completed and behavior preserved.",
        tool_calls: 1,
        input_tokens: 120,
        output_tokens: 40,
      })
      await runtime.finalizeCompleted("Finished without independent verification.", 95)

      const proof = runtime.manager?.proof
      expect(proof).toBeDefined()
      expect(proof?.events.map((event) => event.type)).toContain("tool.requested")
      expect(proof?.events.map((event) => event.type)).toContain("token.used")
      expect(proof?.final_evidence.proof_score).toBe(95)
      expect(runtime.activeProofPath()).toBeTruthy()
      expect(process.env.ARCANA_ACTIVE_RUNPROOF_PATH).toBe(runtime.activeProofPath())
    } finally {
      if (previousActivePath === undefined) delete process.env.ARCANA_ACTIVE_RUNPROOF_PATH
      else process.env.ARCANA_ACTIVE_RUNPROOF_PATH = previousActivePath
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test("persists shell command outcomes to the active proof path", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arcana-proof-runtime-"))
    const previousActivePath = process.env.ARCANA_ACTIVE_RUNPROOF_PATH

    try {
      const runtime = await createProofRuntime({
        enabled: true,
        cwd,
        command: "arcana run --proof",
        prompt: "Run focused tests",
      })

      await runtime.recordShellCommand({
        command: "bun test packages/arcana/src/proof/proof-manager.test.ts",
        cwd,
        status: "passed",
        risk: "low",
        stdout_summary: "19 pass",
      })

      const activePath = runtime.activeProofPath()
      expect(activePath).toBeTruthy()
      const stored = JSON.parse(await readFile(activePath!, "utf8"))
      const proof = stored.proof ?? stored
      expect(proof.execution.shell_commands).toHaveLength(1)
      expect(proof.execution.shell_commands[0].command).toContain("proof-manager.test.ts")
      expect(proof.events.map((event: { type: string }) => event.type)).toContain("command.executed")
      expect(proof.final_evidence.commands_run).toContain("bun test packages/arcana/src/proof/proof-manager.test.ts")
    } finally {
      if (previousActivePath === undefined) delete process.env.ARCANA_ACTIVE_RUNPROOF_PATH
      else process.env.ARCANA_ACTIVE_RUNPROOF_PATH = previousActivePath
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test("persists model route accountability to the active proof path", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arcana-proof-runtime-"))
    const previousActivePath = process.env.ARCANA_ACTIVE_RUNPROOF_PATH

    try {
      const runtime = await createProofRuntime({
        enabled: true,
        cwd,
        command: "arcana run --proof",
        prompt: "Route a model",
      })

      await runtime.recordModelRoute({
        provider: "openai",
        model: "gpt-4.1",
        route: "cloud",
        reason: "CLI override selected the model before execution.",
        data_left_local: true,
        selection_source: "cli",
        fallback_provider: "local",
        fallback_model: "qwen-coder",
        data_boundary: "cloud",
        estimated_cost_usd: 0,
        latency_ms: 0,
      })

      const activePath = runtime.activeProofPath()
      expect(activePath).toBeTruthy()
      const stored = JSON.parse(await readFile(activePath!, "utf8"))
      const proof = stored.proof ?? stored
      const route = proof.events.find((event: { type: string }) => event.type === "sovereignty.routed")
      expect(route?.data.provider).toBe("openai")
      expect(route?.data.model).toBe("gpt-4.1")
      expect(route?.data.selection_source).toBe("cli")
      expect(route?.data.fallback_provider).toBe("local")
      expect(route?.data.fallback_model).toBe("qwen-coder")
      expect(route?.data.data_boundary).toBe("cloud")
      expect(route?.data.data_left_local).toBe(true)
    } finally {
      if (previousActivePath === undefined) delete process.env.ARCANA_ACTIVE_RUNPROOF_PATH
      else process.env.ARCANA_ACTIVE_RUNPROOF_PATH = previousActivePath
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test("persists council consensus evidence to the active proof path", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arcana-proof-runtime-"))
    const previousActivePath = process.env.ARCANA_ACTIVE_RUNPROOF_PATH

    try {
      const runtime = await createProofRuntime({
        enabled: true,
        cwd,
        command: "arcana run --proof",
        prompt: "/consensus compare migration strategies",
      })

      await runtime.recordConsensus({
        council_id: "council_1",
        prompt: "compare migration strategies",
        models: ["arcana/architect", "arcana/verifier"],
        rounds: 2,
        vote_mode: "majority",
        status: "completed",
        winner_model: "arcana/architect",
        vote_tally: { a: 2 },
        cost_tokens: { input: 120, output: 80 },
        transcript: "Tally: a=2",
      })

      const stored = JSON.parse(await readFile(runtime.activeProofPath()!, "utf8"))
      const proof = stored.proof ?? stored
      const event = proof.events.find((item: { type: string }) => item.type === "consensus.recorded")
      expect(event?.refs.council_id).toBe("council_1")
      expect(event?.refs.winner_model).toBe("arcana/architect")
      expect(event?.data.vote_tally).toEqual({ a: 2 })
      expect(event?.data.cost_tokens).toEqual({ input: 120, output: 80 })
    } finally {
      if (previousActivePath === undefined) delete process.env.ARCANA_ACTIVE_RUNPROOF_PATH
      else process.env.ARCANA_ACTIVE_RUNPROOF_PATH = previousActivePath
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test("persists verification checks to the active proof path", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arcana-proof-runtime-"))
    const previousActivePath = process.env.ARCANA_ACTIVE_RUNPROOF_PATH

    try {
      const runtime = await createProofRuntime({
        enabled: true,
        cwd,
        command: "arcana run --proof",
        prompt: "Verify a change",
      })

      await runtime.recordCheck({
        kind: "typecheck",
        command: "bun --cwd packages/tui typecheck",
        status: "passed",
        summary: "TUI typecheck passed.",
        duration_ms: 1234,
      })
      await runtime.recordTestResult({
        command: "bun test packages/arcana/src/proof/proof-manager.test.ts",
        status: "passed",
        summary: "Focused proof tests passed.",
        passed: 16,
        failed: 0,
        skipped: 0,
        duration_ms: 2000,
      })

      const activePath = runtime.activeProofPath()
      expect(activePath).toBeTruthy()
      const stored = JSON.parse(await readFile(activePath!, "utf8"))
      const proof = stored.proof ?? stored
      expect(proof.verification.typecheck.command).toBe("bun --cwd packages/tui typecheck")
      expect(proof.verification.typecheck.status).toBe("passed")
      expect(proof.verification.tests[0].command).toBe("bun test packages/arcana/src/proof/proof-manager.test.ts")
      expect(proof.verification.tests[0].passed).toBe(16)
      expect(proof.events.map((event: { type: string }) => event.type)).toContain("verification.passed")
    } finally {
      if (previousActivePath === undefined) delete process.env.ARCANA_ACTIVE_RUNPROOF_PATH
      else process.env.ARCANA_ACTIVE_RUNPROOF_PATH = previousActivePath
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test("records ML turn signals and persists them to the proof", async () => {
    const cwd = await mkdtemp(join(tmpdir(), "arcana-proof-runtime-"))
    const previousActivePath = process.env.ARCANA_ACTIVE_RUNPROOF_PATH

    try {
      const runtime = await createProofRuntime({
        enabled: true,
        cwd,
        command: "arcana run --proof",
        prompt: "Add a feature",
      })

      await runtime.recordMlSignal({
        kind: "turn",
        signal: {
          kind: "turn",
          intent: "code_edit",
          risk: "medium",
          executionPosture: "assist",
          modelRoute: { profile: "code", reason: "Code task detected." },
          confidence: { value: 0.8, reasons: ["Intent matched."] },
          needs: { sandbox: true, approval: false, web: false, memory: false },
          labels: ["code"],
          reasons: ["Prompt references code, files, or repository work."],
        },
        refs: { intent: "code_edit" },
      })

      const activePath = runtime.activeProofPath()
      expect(activePath).toBeTruthy()
      const stored = JSON.parse(await readFile(activePath!, "utf8"))
      const proof = stored.proof ?? stored
      expect(proof.events.map((event: { type: string }) => event.type)).toContain("ml.signal")
    } finally {
      if (previousActivePath === undefined) delete process.env.ARCANA_ACTIVE_RUNPROOF_PATH
      else process.env.ARCANA_ACTIVE_RUNPROOF_PATH = previousActivePath
      await rm(cwd, { recursive: true, force: true })
    }
  })
})
