// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { ProofManager, type RunProofStatus, type StoredRunProof } from "../../proof/index.js"

export type ProofRuntimeOptions = {
  enabled: boolean
  prompt?: string
  command: string
  cwd?: string
}

export type ProofRuntime = {
  manager?: ProofManager
  enabled: boolean
  activeProofPath(): string | undefined
  recordModelRoute(input: {
    provider: string
    model: string
    route: "local" | "cloud"
    reason: string
    data_left_local: boolean
  }): Promise<void>
  recordUserCommand(command: string, summary?: string): Promise<void>
  recordSystemTransition(status: RunProofStatus, summary?: string): Promise<void>
  recordAgentTurn(input: {
    input_summary: string
    output_summary: string
    tool_calls?: number
    input_tokens?: number
    output_tokens?: number
  }): Promise<void>
  finalizeCompleted(summary: string, proof_score?: number): Promise<void>
  finalizeFailed(error: unknown): Promise<void>
}

function commandForPrompt(prompt: string | undefined): string {
  return prompt ? `arcana run --proof ${JSON.stringify(prompt)}` : "arcana run --proof"
}

async function saveAndPrint(manager: ProofManager): Promise<StoredRunProof> {
  const stored = await manager.save()
  process.stderr.write(`\n${manager.renderTerminal()}\n`)
  process.stderr.write(`\nProof JSON: ${stored.json_path}\n`)
  if (stored.markdown_path) process.stderr.write(`Proof Markdown: ${stored.markdown_path}\n`)
  return stored
}

export async function createProofRuntime(options: ProofRuntimeOptions): Promise<ProofRuntime> {
  const manager = options.enabled
    ? ProofManager.create({
        user_intent: options.prompt ?? "Interactive Arcana session",
        command: options.command || commandForPrompt(options.prompt),
        cwd: options.cwd,
      })
    : undefined
  let activePath: string | undefined

  if (manager) {
    manager.transitionState("planning", "Proof capture initialized; command execution entering planning state.")
  }

  async function saveSnapshot(): Promise<void> {
    if (!manager) return
    const stored = await manager.save()
    activePath = stored.json_path
    process.env.ARCANA_ACTIVE_RUNPROOF_PATH = activePath
  }
  await saveSnapshot()

  return {
    manager,
    enabled: Boolean(manager),
    activeProofPath: () => activePath,

    async recordModelRoute(input) {
      if (!manager) return
      manager.recordEvent({
        type: "sovereignty.routed",
        actor: "system",
        summary: `Provider route selected: ${input.model} via ${input.provider}.`,
        status: manager.proof.lifecycle.status,
        refs: { provider: input.provider, model: input.model },
        data: {
          provider: input.provider,
          model: input.model,
          route: input.route,
          reason: input.reason,
          data_left_local: input.data_left_local,
        },
      })
      await saveSnapshot()
    },

    async recordUserCommand(command, summary = "User command accepted.") {
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
      await saveSnapshot()
    },

    async recordSystemTransition(status, summary) {
      if (!manager) return
      manager.transitionState(status, summary)
      await saveSnapshot()
    },

    async recordAgentTurn(input) {
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
      manager.recordEvent({
        type: "token.used",
        actor: "agent",
        summary: `Agent turn used ${input.input_tokens ?? 0} input tokens and ${input.output_tokens ?? 0} output tokens.`,
        status: manager.proof.lifecycle.status,
        data: {
          input_tokens: input.input_tokens ?? 0,
          output_tokens: input.output_tokens ?? 0,
          total_tokens: (input.input_tokens ?? 0) + (input.output_tokens ?? 0),
          tool_calls: input.tool_calls ?? 0,
        },
      })
      await saveSnapshot()
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
      const stored = await saveAndPrint(manager)
      activePath = stored.json_path
      process.env.ARCANA_ACTIVE_RUNPROOF_PATH = activePath
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
      const stored = await saveAndPrint(manager)
      activePath = stored.json_path
      process.env.ARCANA_ACTIVE_RUNPROOF_PATH = activePath
    },
  }
}
