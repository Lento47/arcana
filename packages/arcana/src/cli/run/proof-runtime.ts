// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { ProofManager, type RunProofStatus } from "../../proof/index.js"

export type ProofRuntimeOptions = {
  enabled: boolean
  prompt?: string
  command: string
  cwd?: string
}

export type ProofRuntime = {
  manager?: ProofManager
  enabled: boolean
  recordUserCommand(command: string, summary?: string): void
  recordSystemTransition(status: RunProofStatus, summary?: string): void
  recordAgentTurn(input: {
    input_summary: string
    output_summary: string
    tool_calls?: number
    input_tokens?: number
    output_tokens?: number
  }): void
  finalizeCompleted(summary: string, proof_score?: number): Promise<void>
  finalizeFailed(error: unknown): Promise<void>
}

function commandForPrompt(prompt: string | undefined): string {
  return prompt ? `arcana run --proof ${JSON.stringify(prompt)}` : "arcana run --proof"
}

async function saveAndPrint(manager: ProofManager): Promise<void> {
  const stored = await manager.save()
  process.stderr.write(`\n${manager.renderTerminal()}\n`)
  process.stderr.write(`\nProof JSON: ${stored.json_path}\n`)
  if (stored.markdown_path) process.stderr.write(`Proof Markdown: ${stored.markdown_path}\n`)
}

export function createProofRuntime(options: ProofRuntimeOptions): ProofRuntime {
  const manager = options.enabled
    ? ProofManager.create({
        user_intent: options.prompt ?? "Interactive Arcana session",
        command: options.command || commandForPrompt(options.prompt),
        cwd: options.cwd,
      })
    : undefined

  if (manager) {
    manager.transitionState("planning", "Proof capture initialized; command execution entering planning state.")
  }

  return {
    manager,
    enabled: Boolean(manager),

    recordUserCommand(command, summary = "User command accepted.") {
      if (!manager) return
      manager.recordCommand({
        command,
        source: "user",
        state_before: manager.proof.lifecycle.status,
        state_after: "planning",
        visible_in_tui: true,
        reversible: false,
        result_summary: summary,
      })
    },

    recordSystemTransition(status, summary) {
      manager?.transitionState(status, summary)
    },

    recordAgentTurn(input) {
      if (!manager) return
      manager.recordToolCall({
        name: "agent.run_turn",
        status: "passed",
        risk: "unknown",
        input_summary: input.input_summary,
        output_summary: input.output_summary,
      })
      manager.recordCommand({
        command: "agent.run_turn",
        source: "agent",
        state_before: manager.proof.lifecycle.status,
        state_after: "verifying",
        visible_in_tui: true,
        reversible: false,
        result_summary: `${input.tool_calls ?? 0} tool call(s), ${input.input_tokens ?? 0} input tokens, ${input.output_tokens ?? 0} output tokens.`,
      })
    },

    async finalizeCompleted(summary, proof_score = 25) {
      if (!manager) return
      manager.recordCommand({
        command: "runproof.finalize",
        source: "system",
        state_before: manager.proof.lifecycle.status,
        state_after: "completed",
        visible_in_tui: true,
        reversible: false,
        result_summary: summary,
      })
      manager.finalize({
        status: "completed",
        summary,
        evidence: {
          proof_score,
          human_review_recommended: true,
          commands_run: manager.proof.command_history.map((entry) => entry.command),
        },
      })
      await saveAndPrint(manager)
    },

    async finalizeFailed(error) {
      if (!manager) return
      const summary = error instanceof Error ? error.message : String(error)
      manager.recordCommand({
        command: "runproof.finalize_failed",
        source: "system",
        state_before: manager.proof.lifecycle.status,
        state_after: "failed",
        visible_in_tui: true,
        reversible: false,
        result_summary: summary,
      })
      manager.finalize({
        status: "failed",
        summary,
        evidence: {
          proof_score: 10,
          human_review_recommended: true,
          commands_run: manager.proof.command_history.map((entry) => entry.command),
        },
      })
      await saveAndPrint(manager)
    },
  }
}
