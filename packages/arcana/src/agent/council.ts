/**
 * Council mode — multi-LLM debate + vote.
 *
 * Phases:
 *   1. Initial proposals (each model sees the prompt alone, returns a proposal)
 *   2. Cross-critique (each model sees others' proposals, returns critique + revised)
 *   3. Vote (each model votes on the strongest proposal, with one-line justification)
 *   4. Synthesis (winner or, if judge mode, judge model picks; the winning text is
 *      returned to the calling agent)
 *
 * License: gated behind `pro|team|enterprise` tier OR `runner.config.godlike`.
 * Cost: each model call capped at 1500 output tokens; total round cap = 2.
 *
 * Failures: a model that errors is dropped from the vote. If all error, the tool
 * returns the partial transcript as an error so the calling agent can fall back.
 */
import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { createAnthropic } from "@ai-sdk/anthropic"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import type { AgentRunner } from "./runner.js"
import { resolveProvider } from "./providers.js"
import type { MemoryStore } from "@arcana/memory"
import type { ModelsDevProvider } from "./models-dev.js"

export type CouncilModelSpec = string // "provider/model"
export type VoteMode = "majority" | "ranked" | "judge"

export interface CouncilArgs {
  prompt: string
  models: CouncilModelSpec[]                 // 2-5 models
  rounds?: 1 | 2                             // 1 = propose+vote, 2 = +critique+revise
  vote_mode?: VoteMode                       // default "majority"
  judge_model?: CouncilModelSpec             // required for judge mode; defaults to first
  context?: string                           // optional background the models should consider
}

export interface CouncilResult {
  council_id?: string
  winner: string
  winner_model: string
  vote_tally: Record<string, number>
  transcript: string                         // ≤ 2KB summary
  cost_tokens: { input: number; output: number }
  rounds: number
  models_used: string[]
  errored: string[]
}

const PER_CALL_OUTPUT_CAP = 1500
const TRANSCRIPT_MAX_CHARS = 2048

/** Read the license cache. Returns the tier or null if not licensed. */
function readLicenseTier(): "pro" | "team" | "enterprise" | null {
  try {
    const path = join(homedir(), ".arcana", ".license-cache.json")
    if (!existsSync(path)) return null
    const raw = readFileSync(path, "utf8")
    const parsed = JSON.parse(raw) as { data?: { tier?: string } }
    const tier = parsed?.data?.tier
    if (tier === "pro" || tier === "team" || tier === "enterprise") return tier
    return null
  } catch {
    return null
  }
}

/** Build an AI SDK model for a `provider/model` spec, sourcing the key from env or config. */
async function buildModel(spec: CouncilModelSpec, baseApiKey?: string) {
  const [provider, model] = spec.split("/", 2) as [string, string]
  const profile = await resolveProvider(provider)
  const key = (profile.envKey ? process.env[profile.envKey] : undefined) ?? baseApiKey
  if (!key) {
    throw new Error(
      `No API key for council model "${spec}". Set ${profile.envKey ?? "ARCANA_API_KEY"} or pass apiKey.`,
    )
  }
  const p = provider.toLowerCase()
  if (p === "openai") return createOpenAI({ apiKey: key })(model)
  if (p === "anthropic") return createAnthropic({ apiKey: key })(model)
  if (p === "google" || p === "gemini") return createGoogleGenerativeAI({ apiKey: key })(model)
  return createOpenAICompatible({
    apiKey: key,
    baseURL: profile.baseURL ?? `https://api.${provider}.com/v1`,
    name: provider,
  })(model)
}

// ---------------------------------------------------------------------------
// Roster discovery (consensus C1): make model selection work from reality.
// ---------------------------------------------------------------------------

const COUNCIL_MAX_MODELS = 5
/** Proxy catalog IDs are prefixed "~" (e.g. "~openai/gpt-x"); strip before use. */
function stripTildePrefix(spec: string): string {
  return spec.replace(/^~+/, "")
}

/**
 * True when the given provider/model spec can be paid for right now: its
 * provider advertises an env key that is set, it is the licensed Arcana
 * Proxy, or a base key was supplied.
 */
async function hasCredential(spec: CouncilModelSpec, baseApiKey?: string): Promise<boolean> {
  const clean = stripTildePrefix(spec)
  const [provider] = clean.split("/", 2) as [string, string | undefined]
  if (!provider) return false
  try {
    const profile = await resolveProvider(provider)
    if (provider === "arcana-proxy") return Boolean(process.env.ARCANA_PROXY_KEY?.trim() || baseApiKey)
    if (profile.envKey && process.env[profile.envKey]) return true
    return Boolean(baseApiKey)
  } catch {
    // Unknown provider id: only the proxy can vouch for it.
    return provider === "arcana-proxy" && Boolean(process.env.ARCANA_PROXY_KEY?.trim())
  }
}

/**
 * Build the default council roster from credentials that actually exist:
 * explicit preferences first, then env-keyed providers (one model each,
 * deterministic order), then the licensed Arcana Proxy catalog to fill
 * remaining seats with cross-provider diversity. Returns 0-5 specs plus the
 * skipped candidates for auditability.
 */
export async function defaultCouncilRoster(
  preferred?: CouncilModelSpec[],
  baseApiKey?: string,
): Promise<{ roster: CouncilModelSpec[]; skipped: string[] }> {
  const { fetchModelsDev } = await import("./models-dev.js")
  const merged: Record<string, ModelsDevProvider> = {}
  try {
    Object.assign(merged, await fetchModelsDev())
  } catch {}

  const skipped: string[] = []
  const roster: CouncilModelSpec[] = []
  const seen = new Set<string>()
  const push = async (specRaw: CouncilModelSpec) => {
    const spec = stripTildePrefix(specRaw)
    if (roster.length >= COUNCIL_MAX_MODELS || seen.has(spec)) return
    if (!(await hasCredential(spec, baseApiKey))) {
      skipped.push(spec)
      return
    }
    seen.add(spec)
    roster.push(spec)
  }

  // 1. Explicit preferences first (operator intent wins).
  for (const spec of preferred ?? []) await push(spec)

  // 2. Env-keyed providers, one model each.
  for (const id of Object.keys(merged).sort()) {
    if (roster.length >= COUNCIL_MAX_MODELS) break
    if (id === "arcana-proxy") continue
    const md = merged[id]!
    const envKey = md.env?.find((k) => process.env[k]?.trim())
    if (!envKey) continue
    const model = md.models ? Object.keys(md.models)[0] : undefined
    if (!model) continue
    await push(`${id}/${model}`)
  }

  // 3. Licensed proxy fills remaining seats with catalog diversity
  //    (one model per top-level provider prefix, alphabetical).
  if (roster.length < COUNCIL_MAX_MODELS && process.env.ARCANA_PROXY_KEY?.trim()) {
    try {
      const res = await fetch("https://proxy-arcana.otnelhq.com/v1/models", {
        headers: { Authorization: `Bearer ${process.env.ARCANA_PROXY_KEY}` },
        signal: AbortSignal.timeout(3500),
      })
      if (res.ok) {
        const json = (await res.json()) as { data?: Array<{ id?: string }> }
        const byProvider = new Map<string, string>()
        for (const raw of (json.data ?? []).map((m) => m.id ?? "").sort()) {
          const id = stripTildePrefix(raw)
          if (!id) continue
          const provider = id.split("/")[0]!
          if (!byProvider.has(provider)) byProvider.set(provider, id)
        }
        for (const [, id] of byProvider) {
          if (roster.length >= COUNCIL_MAX_MODELS) break
          await push(`arcana-proxy/${id}`)
        }
      }
    } catch {}
  }

  return { roster, skipped }
}

const PROPOSE_INSTRUCTIONS = `You are a council member. State your answer in ≤250 words.\nBe specific, not hedged. If you would change your mind after hearing others, say so.`
const CRITIQUE_INSTRUCTIONS = `You are a council member in round 2. You've seen the other proposals below.\nIn ≤200 words: (1) the strongest idea in someone else's proposal you'd adopt, (2) the biggest flaw in your own, (3) your revised answer.`
const VOTE_INSTRUCTIONS = `You are voting on which proposal is strongest. Reply with EXACTLY one line:\nVOTE: <letter>\n\nfollowed by a ≤30 word justification.`

/** Run a single generateText with timeout, capturing text + token usage. */
async function callModel(
  spec: CouncilModelSpec,
  system: string,
  user: string,
  baseApiKey?: string,
): Promise<{ text: string; input: number; output: number } | { error: string }> {
  try {
    const model = await buildModel(spec, baseApiKey)
    const result = await Promise.race([
      generateText({
        model,
        system,
        messages: [{ role: "user", content: user }],
        maxOutputTokens: PER_CALL_OUTPUT_CAP,
        temperature: 0.7,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`model ${spec} timed out`)), 60_000),
      ),
    ])
    return {
      text: result.text.trim(),
      input: result.usage?.inputTokens ?? 0,
      output: result.usage?.outputTokens ?? 0,
    }
  } catch (e) {
    return { error: `model ${spec}: ${e instanceof Error ? e.message : String(e)}` }
  }
}

/** Tally votes. Vote lines look like "VOTE: B" or "VOTE: option-b". */
function tallyVotes(votes: string[]): Record<string, number> {
  const tally: Record<string, number> = {}
  for (const v of votes) {
    const m = v.match(/VOTE:\s*([A-Za-z0-9_-]+)/i)
    if (!m) continue
    const key = m[1]!.toLowerCase()
    tally[key] = (tally[key] ?? 0) + 1
  }
  return tally
}

function parseVote(raw: string): { vote?: string; justification?: string } {
  const match = raw.match(/VOTE:\s*([A-Za-z0-9_-]+)/i)
  const vote = match?.[1]?.toLowerCase()
  const justification = raw
    .split(/\r?\n/)
    .filter((line) => !/^VOTE:/i.test(line.trim()))
    .join(" ")
    .trim()
  return { vote, justification: justification || undefined }
}

export async function runCouncil(args: CouncilArgs, runner: AgentRunner, memory?: MemoryStore): Promise<string> {
  // 1. License gate
  if (!runner.config.godlike) {
    const tier = readLicenseTier()
    if (!tier) {
      return "[LICENSE] council mode requires a Pro, Team, or Enterprise license. Run `arcana license activate` or set ARCANA_LICENSE_KEY. (Bypass: --godlike.)"
    }
  }

  // 2. Validate args - models are OPTIONAL (consensus C1): filled from live
  // credentials when omitted/partially-credentialed (operator picks first,
  // then env-keyed providers, then the licensed Arcana Proxy catalog).
  const preferred = (args.models ?? []).map(stripTildePrefix).slice(0, COUNCIL_MAX_MODELS)
  const { roster, skipped } = await defaultCouncilRoster(preferred, runner.config.apiKey)
  const models = roster
  if (models.length < 2) {
    await runner.config.proofGate?.recordConsensus?.({
      prompt: args.prompt,
      models,
      rounds: args.rounds ?? 1,
      vote_mode: args.vote_mode ?? "majority",
      status: "failed",
      errored: [
        "council needs at least 2 credentialed models",
        ...(skipped.length ? [`skipped (no credential): ${skipped.join(", ")}`] : []),
      ],
    })
    return [
      "council: needs at least 2 credentialed models.",
      ...(skipped.length ? [`Skipped (no credential): ${skipped.join(", ")}.`] : []),
      "Set provider API keys or ensure ~/.arcana/proxy_key exists for the Arcana Proxy.",
    ].join(" ")
  }
  const rounds = Math.min(args.rounds ?? 1, 2) as 1 | 2
  const voteMode: VoteMode = args.vote_mode ?? "majority"
  const judgeModel = args.judge_model ?? models[0]!

  if (voteMode === "judge" && !models.includes(judgeModel)) {
    await runner.config.proofGate?.recordConsensus?.({
      prompt: args.prompt,
      models,
      rounds,
      vote_mode: voteMode,
      status: "failed",
      errored: [`judge_model "${judgeModel}" must be in the models list`],
    })
    return `council: judge_model "${judgeModel}" must be in the models list`
  }

  const councilStore = memory
  const ledger = councilStore?.createCouncilSession({
    prompt: args.prompt,
    context: args.context,
    vote_mode: voteMode,
    rounds,
    judge_model: voteMode === "judge" ? judgeModel : undefined,
  })

  // 3. Phase 1: initial proposals
  const baseApiKey = runner.config.apiKey
  const proposePrompt = args.context
    ? `Context:\n${args.context}\n\n---\n\nQuestion:\n${args.prompt}`
    : args.prompt
  const proposalResults = await Promise.all(
    models.map((m) => callModel(m, PROPOSE_INSTRUCTIONS, proposePrompt, baseApiKey)),
  )

  const proposals: { spec: string; text: string }[] = []
  const errored: string[] = []
  let totalInput = 0
  let totalOutput = 0
  proposalResults.forEach((r, i) => {
    const model = models[i]!
    if ("error" in r) {
      errored.push(`${model}: ${r.error}`)
      if (ledger && councilStore) {
        councilStore.recordCouncilMessage({ council_id: ledger.id, agent_model: model, phase: "error", error: r.error })
      }
    } else {
      if (ledger && councilStore) {
        councilStore.recordCouncilMessage({
          council_id: ledger.id,
          agent_model: model,
          phase: "proposal",
          content: r.text,
          input_tokens: r.input,
          output_tokens: r.output,
        })
      }
      proposals.push({ spec: models[i]!, text: r.text })
      totalInput += r.input
      totalOutput += r.output
    }
  })
  if (proposals.length < 2) {
    if (ledger && councilStore) councilStore.finalizeCouncilSession(ledger.id, { status: "failed" })
    await runner.config.proofGate?.recordConsensus?.({
      council_id: ledger?.id,
      prompt: args.prompt,
      models,
      rounds,
      vote_mode: voteMode,
      status: "failed",
      errored,
      cost_tokens: { input: totalInput, output: totalOutput },
    })
    return `council: need ≥2 successful proposals; got ${proposals.length}\nErrors:\n${errored.join("\n")}`
  }

  // 4. Phase 2: cross-critique + revise (only if rounds=2)
  if (rounds === 2) {
    const letters = proposals.map((_, i) => String.fromCharCode(65 + i))
    const proposalBlock = proposals
      .map((p, i) => `[${letters[i]}] (${p.spec})\n${p.text}`)
      .join("\n\n---\n\n")
    const critiqueResults = await Promise.all(
      proposals.map((p, i) =>
        callModel(
          p.spec,
          CRITIQUE_INSTRUCTIONS,
          `Your original proposal was [${letters[i]}]:\n${p.text}\n\nOther proposals:\n\n${proposalBlock}\n\nRevise your answer.`,
          baseApiKey,
        ),
      ),
    )
    critiqueResults.forEach((r, i) => {
      const model = proposals[i]!.spec
      if ("error" in r) {
        errored.push(`${model} (critique): ${r.error}`)
        if (ledger && councilStore) {
          councilStore.recordCouncilMessage({ council_id: ledger.id, agent_model: model, phase: "error", error: r.error })
        }
      } else {
        proposals[i] = { spec: model, text: r.text }
        if (ledger && councilStore) {
          councilStore.recordCouncilMessage({
            council_id: ledger.id,
            agent_model: model,
            phase: "critique",
            content: r.text,
            input_tokens: r.input,
            output_tokens: r.output,
          })
        }
        totalInput += r.input
        totalOutput += r.output
      }
    })
  }

  // 5. Phase 3: vote
  const letters = proposals.map((_, i) => String.fromCharCode(65 + i))
  const voteBallot = proposals
    .map((p, i) => `[${letters[i]}] (${p.spec})\n${p.text}`)
    .join("\n\n---\n\n")
  const voteResults = await Promise.all(
    proposals.map((p) =>
      callModel(p.spec, VOTE_INSTRUCTIONS, `Proposals:\n\n${voteBallot}\n\nYour vote:`, baseApiKey),
    ),
  )
  const votes: string[] = []
  voteResults.forEach((r, i) => {
    const model = proposals[i]!.spec
    if ("error" in r) {
      errored.push(`${model} (vote): ${r.error}`)
      if (ledger && councilStore) {
        councilStore.recordCouncilMessage({ council_id: ledger.id, agent_model: model, phase: "error", error: r.error })
      }
    } else {
      votes.push(r.text)
      if (ledger && councilStore) {
        const parsed = parseVote(r.text)
        councilStore.recordCouncilMessage({
          council_id: ledger.id,
          agent_model: model,
          phase: "vote",
          content: r.text,
          input_tokens: r.input,
          output_tokens: r.output,
        })
        councilStore.recordCouncilVote({
          council_id: ledger.id,
          agent_model: model,
          vote: parsed.vote,
          justification: parsed.justification,
          raw: r.text,
        })
      }
      totalInput += r.input
      totalOutput += r.output
    }
  })

  // 6. Phase 4: pick winner
  const tally = tallyVotes(votes)
  let winnerLetter = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0]
  let winner: string
  let winner_model: string

  if (voteMode === "judge" || !winnerLetter) {
    // Ask the judge model to pick from the proposals
    const judgePrompt = `You are the judge. Pick the single strongest proposal. Reply with EXACTLY:\nWINNER: <letter>\n\nthen ≤40 words on why.`
    const judgeResult = await callModel(
      judgeModel,
      judgePrompt,
      `Proposals:\n\n${voteBallot}\n\nYour pick:`,
      baseApiKey,
    )
    if ("error" in judgeResult) {
      // Fall back to plurality
      winnerLetter = winnerLetter ?? letters[0] ?? "A"
      if (ledger && councilStore) {
        councilStore.recordCouncilMessage({ council_id: ledger.id, agent_model: judgeModel, phase: "error", error: judgeResult.error })
      }
    } else {
      if (ledger && councilStore) {
        councilStore.recordCouncilMessage({
          council_id: ledger.id,
          agent_model: judgeModel,
          phase: "judge",
          content: judgeResult.text,
          input_tokens: judgeResult.input,
          output_tokens: judgeResult.output,
        })
      }
      const m = judgeResult.text.match(/WINNER:\s*([A-Za-z0-9_-]+)/i)
      if (m) winnerLetter = m[1]!.toLowerCase()
      totalInput += judgeResult.input
      totalOutput += judgeResult.output
    }
  }

  const winnerIdx = winnerLetter ? letters.findIndex((l) => l.toLowerCase() === winnerLetter.toLowerCase()) : 0
  if (winnerIdx < 0 || winnerIdx >= proposals.length) {
    winnerLetter = letters[0] ?? "A"
  }
  const winnerEntry = proposals[winnerIdx === -1 ? 0 : winnerIdx] ?? proposals[0]!
  winner = winnerEntry.text
  winner_model = winnerEntry.spec
  if (ledger && councilStore) {
    councilStore.finalizeCouncilSession(ledger.id, { status: "completed", winner_model, winner })
  }

  // 7. Build result
  const result: CouncilResult = {
    council_id: ledger?.id,
    winner,
    winner_model,
    vote_tally: tally,
    transcript: buildTranscript(proposals, letters, votes, tally, errored, rounds, voteMode, judgeModel),
    cost_tokens: { input: totalInput, output: totalOutput },
    rounds,
    models_used: proposals.map((p) => p.spec),
    errored,
  }
  await runner.config.proofGate?.recordConsensus?.({
    council_id: result.council_id,
    prompt: args.prompt,
    models: result.models_used,
    rounds: result.rounds,
    vote_mode: voteMode,
    status: "completed",
    winner_model: result.winner_model,
    vote_tally: result.vote_tally,
    cost_tokens: result.cost_tokens,
    errored: result.errored,
    transcript: result.transcript,
  })
  return formatResult(result)
}

function buildTranscript(
  proposals: { spec: string; text: string }[],
  letters: string[],
  votes: string[],
  tally: Record<string, number>,
  errored: string[],
  rounds: number,
  voteMode: VoteMode,
  judgeModel: string,
): string {
  const lines: string[] = []
  lines.push(`Council: ${proposals.length} models, ${rounds} round(s), vote=${voteMode}${voteMode === "judge" ? ` (judge=${judgeModel})` : ""}`)
  if (errored.length) lines.push(`Errors: ${errored.length} (${errored.slice(0, 2).join("; ")}${errored.length > 2 ? "..." : ""})`)
  lines.push("")
  proposals.forEach((p, i) => {
    lines.push(`[${letters[i]}] ${p.spec}`)
    lines.push(p.text.slice(0, 400) + (p.text.length > 400 ? "…" : ""))
    lines.push(`vote: ${(votes[i] ?? "(none)").slice(0, 120)}`)
    lines.push("")
  })
  const tallyLine = Object.entries(tally).map(([k, v]) => `${k}=${v}`).join(", ") || "no valid votes"
  lines.push(`Tally: ${tallyLine}`)
  return lines.join("\n").slice(0, TRANSCRIPT_MAX_CHARS)
}

function formatResult(r: CouncilResult): string {
  const lines: string[] = [
    `◆ Council result (winner: ${r.winner_model})`,
    r.council_id ? `Ledger: ${r.council_id}` : ``,
    ``,
    r.winner,
    ``,
    `───`,
    `Votes: ${Object.entries(r.vote_tally).map(([k, v]) => `${k}:${v}`).join(", ") || "(none)"}`,
    `Rounds: ${r.rounds} | Models: ${r.models_used.length}${r.errored.length ? ` (errored: ${r.errored.length})` : ""}`,
    `Cost: ${r.cost_tokens.input} in / ${r.cost_tokens.output} out tokens`,
  ]
  return lines.join("\n")
}
