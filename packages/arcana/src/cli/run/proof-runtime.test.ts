// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { mkdtemp, readFile, rm } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"

import { describe, expect, test } from "bun:test"

import { createProofRuntime } from "./proof-runtime.js"

describe("ProofRuntime live evidence capture", () => {
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
