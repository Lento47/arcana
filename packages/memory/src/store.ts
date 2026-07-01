import type { Database } from "bun:sqlite"
import { randomUUID } from "node:crypto"
import { exactHash, isNearDuplicate, normalize, JACCARD_DEDUP_THRESHOLD } from "./dedup.js"

function now(): string {
  return new Date().toISOString()
}

export type Session = {
  id: string
  title?: string
  model?: string
  provider?: string
  created_at: string
  updated_at: string
  message_count: number
  summary?: string
}

export type Message = {
  id: string
  session_id: string
  role: "user" | "assistant" | "tool" | "system"
  content: string
  created_at: string
  tokens: number
}

export type Artifact = {
  id: string
  title: string
  content: string
  source_session?: string
  tags?: string
  created_at: string
}

export type UserFact = {
  id: string
  key: string
  value: string
  source?: string
  confidence: number
  created_at: string
  updated_at: string
  last_accessed_at?: string
  content_hash?: string
  value_normalized?: string
}

export type SkillObservation = {
  id: string
  skill_id: string
  session_id?: string
  observation: string
  created_at: string
}

export type Feedback = {
  id: string
  session_id?: string
  message_id?: string
  rating?: "up" | "down"
  category?: string
  note?: string
  source: string
  created_at: string
}

export type AgentCouncilSession = {
  id: string
  prompt: string
  context?: string
  vote_mode: string
  rounds: number
  judge_model?: string
  winner_model?: string
  winner?: string
  status: "running" | "completed" | "failed"
  created_at: string
  updated_at: string
}

export type AgentCouncilMessage = {
  id: string
  council_id: string
  agent_model: string
  phase: "proposal" | "critique" | "vote" | "judge" | "error"
  content?: string
  input_tokens: number
  output_tokens: number
  error?: string
  created_at: string
}

export type AgentCouncilVote = {
  id: string
  council_id: string
  agent_model: string
  vote?: string
  justification?: string
  raw: string
  created_at: string
}

export type SearchResult = {
  type: "session" | "message" | "user_fact"
  id: string
  session_id?: string
  /** Composite score: (-bm25) * recency_weight * confidence. Higher = better. */
  rank: number
  snippet: string
  confidence?: number
}

/** Scoring constants — exposed so tests can reference them. */
export const RECENCY_HALFLIFE_DAYS = 30
/** Half-life (days) for confidence decay; matches cfada01's decay-pipeline intent. */
export const CONFIDENCE_HALFLIFE_DAYS = 60
/** SQLite busy timeout for write-lock contention (ms). */
export const WRITE_LOCK_TIMEOUT_MS = 5000

/** Days between two ISO timestamps (fractional). Negative if `a` precedes `b`. */
function daysBetween(a: string, b: string): number {
  return (new Date(a).getTime() - new Date(b).getTime()) / (1000 * 60 * 60 * 24)
}

/**
 * Recency weight: 1.0 at age 0, 0.5 at age = RECENCY_HALFLIFE_DAYS,
 * 0.25 at age = 2*RECENCY_HALFLIFE_DAYS.
 *
 * Implemented as `2^(-age/halflife)` rather than `exp(-age/halflife)`
 * because the half-life constant then directly equals the days-to-half.
 * (`exp(-t/τ)` halves at `t = τ·ln2 ≈ 0.693τ`, not `τ`.)
 */
export function recencyWeight(isoTimestamp: string, asOf?: string): number {
  const ageDays = Math.max(0, daysBetween(asOf ?? now(), isoTimestamp))
  return Math.pow(2, -ageDays / RECENCY_HALFLIFE_DAYS)
}

/** Decayed confidence: `confidence · 2^(-age/halfLife)` from `last_accessed_at`. */
export function decayedConfidence(fact: { confidence: number; last_accessed_at?: string; created_at: string }, asOf?: string): number {
  const anchor = fact.last_accessed_at ?? fact.created_at
  const ageDays = Math.max(0, daysBetween(asOf ?? now(), anchor))
  return fact.confidence * Math.pow(2, -ageDays / CONFIDENCE_HALFLIFE_DAYS)
}

export class MemoryStore {
  constructor(private readonly db: Database) {}

  createSession(opts: { title?: string; model?: string; provider?: string } = {}): Session {
    const session: Session = {
      id: randomUUID(),
      title: opts.title,
      model: opts.model,
      provider: opts.provider,
      created_at: now(),
      updated_at: now(),
      message_count: 0,
    }
    this.db
      .prepare(`INSERT INTO sessions (id, title, model, provider, created_at, updated_at, message_count) VALUES (?, ?, ?, ?, ?, ?, 0)`)
      .run(session.id, session.title ?? null, session.model ?? null, session.provider ?? null, session.created_at, session.updated_at)
    return session
  }

  getSession(id: string): Session | null {
    return (this.db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(id) as Session | undefined) ?? null
  }

  listSessions(limit = 50): Session[] {
    return this.db.prepare(`SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?`).all(limit) as Session[]
  }

  updateSessionSummary(id: string, summary: string): void {
    this.db.prepare(`UPDATE sessions SET summary = ?, updated_at = ? WHERE id = ?`).run(summary, now(), id)
  }

  updateSessionTitle(id: string, title: string): void {
    this.db.prepare(`UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?`).run(title, now(), id)
  }

  addMessage(sessionId: string, role: Message["role"], content: string, tokens = 0): Message {
    const msg: Message = {
      id: randomUUID(),
      session_id: sessionId,
      role,
      content,
      created_at: now(),
      tokens,
    }
    this.db
      .prepare(`INSERT INTO messages (id, session_id, role, content, created_at, tokens) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(msg.id, msg.session_id, msg.role, msg.content, msg.created_at, msg.tokens)
    this.db.prepare(`UPDATE sessions SET message_count = message_count + 1, updated_at = ? WHERE id = ?`).run(now(), sessionId)
    return msg
  }

  getMessages(sessionId: string): Message[] {
    return this.db.prepare(`SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC`).all(sessionId) as Message[]
  }

  /**
   * Composite search across sessions, messages, and user facts.
   *
   * Score = (-bm25) * recency_weight * confidence
   *
   * FTS5 bm25() returns negative values where lower = better, so we negate.
   * recency_weight = exp(-age_days / RECENCY_HALFLIFE_DAYS).
   * confidence: 1.0 for sessions/messages (no stored signal), decayed for facts.
   *
   * Results are sorted DESC by composite score, limit applied AFTER merge so
   * we get the global top-N across all three sources.
   */
  search(query: string, limit = 10): SearchResult[] {
    const merged: SearchResult[] = []
    const asOf = now()

    // Sessions — FTS5 virtual table stores title + summary; updated_at comes
    // from the sessions row via JOIN.
    const sessionResults = this.db
      .prepare(
        `SELECT f.id, f.title AS snippet,
                bm25(session_fts) AS bm25,
                s.updated_at
         FROM session_fts f
         JOIN sessions s ON f.id = s.id
         WHERE session_fts MATCH ?
         ORDER BY bm25
         LIMIT ?`,
      )
      .all(query, limit * 2) as Array<{ id: string; snippet: string; bm25: number; updated_at: string }>

    for (const r of sessionResults) {
      const recency = recencyWeight(r.updated_at, asOf)
      const score = -r.bm25 * recency * 1.0
      merged.push({ type: "session" as const, id: r.id, rank: score, snippet: r.snippet })
    }

    // Messages
    const messageResults = this.db
      .prepare(
        `SELECT m.id, m.session_id, SUBSTR(m.content, 1, 200) AS snippet,
                bm25(message_fts) AS bm25,
                m.created_at
         FROM message_fts
         JOIN messages m ON message_fts.id = m.id
         WHERE message_fts MATCH ?
         ORDER BY bm25
         LIMIT ?`,
      )
      .all(query, limit * 2) as Array<{ id: string; session_id: string; snippet: string; bm25: number; created_at: string }>

    for (const r of messageResults) {
      const recency = recencyWeight(r.created_at, asOf)
      const score = -r.bm25 * recency * 1.0
      merged.push({
        type: "message" as const,
        id: r.id,
        session_id: r.session_id,
        rank: score,
        snippet: r.snippet,
      })
    }

    // User facts — FTS5 query sanitization.
    // Strategy: split into tokens, append `*` to the last token for prefix
    // match (so "type" matches "typescript", "mac" matches "macos"), and
    // join with spaces (FTS5 implicit AND). Each token is individually
    // double-quoted to avoid FTS5 syntax collisions.
    const queryTokens = query
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .trim()
      .split(/\s+/)
      .filter((t) => t.length > 0)
    const factQuery = queryTokens.length === 0
      ? '""'
      : queryTokens.length === 1
        ? `"${queryTokens[0]!.replace(/"/g, '""')}"`
        : queryTokens
            .map((t, i) => {
              const escaped = t.replace(/"/g, '""')
              // Prefix-match only the last token to keep the AND set tight;
              // earlier tokens must hit exactly.
              return i === queryTokens.length - 1 ? `"${escaped}"*` : `"${escaped}"`
            })
            .join(" ")
    const factResults = this.db
      .prepare(
        `SELECT f.id, f.key, f.value, f.confidence,
                f.created_at, f.last_accessed_at,
                bm25(user_facts_fts) AS bm25
         FROM user_facts_fts
         JOIN user_facts f ON user_facts_fts.id = f.id
         WHERE user_facts_fts MATCH ?
         ORDER BY bm25
         LIMIT ?`,
      )
      .all(factQuery, limit * 2) as Array<{
      id: string
      key: string
      value: string
      confidence: number
      created_at: string
      last_accessed_at: string | null
      bm25: number
    }>

    for (const r of factResults) {
      const recency = recencyWeight(r.last_accessed_at ?? r.created_at, asOf)
      // Use *stored* confidence (not decayed) — search callers see the
      // authored confidence; runtime decay is applied via runDecay() so the
      // operator can observe decay as a scheduled event.
      const score = -r.bm25 * recency * Math.max(0, Math.min(1, r.confidence))
      merged.push({
        type: "user_fact" as const,
        id: r.id,
        rank: score,
        snippet: `${r.key}: ${r.value}`,
        confidence: r.confidence,
      })
    }

    return merged.sort((a, b) => b.rank - a.rank).slice(0, limit)
  }

  /**
   * Upsert a user fact with hash + Jaccard dedup.
   *
   * Decision: on near-duplicate, UPDATE the existing record (refresh
   * last_accessed_at, optionally bump confidence toward the new value).
   * Rationale: keeps the fact graph compact, lets confidence accumulate,
   * and avoids the operator having to manually clean up bloat.
   *
   * Returns { fact, merged: true } if dedup hit, { fact, merged: false }
   * for a fresh insert. Callers (memory_store_fact tool, learning pipeline)
   * can use `merged` to surface "we already knew that" feedback to the user.
   */
  recordUserFact(
    key: string,
    value: string,
    source?: string,
    confidence = 1.0,
  ): { fact: UserFact; merged: boolean } {
    const ts = now()
    const valueNorm = normalize(value)
    const hash = exactHash(value)

    // Dedup scope: same-key facts only. A "dark mode" theme preference and a
    // "dark mode" language preference are semantically distinct — collapsing
    // them would lose information. Within a key (e.g. "user.theme"), facts
    // are paraphrases of the same proposition and should merge.
    const sameKey = this.db
      .prepare(`SELECT * FROM user_facts WHERE key = ?`)
      .all(key) as UserFact[]

    for (const existing of sameKey) {
      // Fast path: identical hash → always merge.
      if (existing.content_hash === hash) {
        const bumpedConfidence = Math.max(existing.confidence, Math.min(1, confidence))
        const nextSource = source ?? existing.source ?? null
        this.db
          .prepare(
            `UPDATE user_facts SET source = ?, confidence = ?, updated_at = ?, last_accessed_at = ? WHERE id = ?`,
          )
          .run(nextSource, bumpedConfidence, ts, ts, existing.id)
        return {
          fact: { ...existing, source: nextSource ?? undefined, confidence: bumpedConfidence, updated_at: ts, last_accessed_at: ts },
          merged: true,
        }
      }
      // Slow path: Jaccard shingle overlap. Bounded by 1-per-key per session
      // in practice — typically a few rows.
      if (
        isNearDuplicate(value, {
          hash: existing.content_hash ?? exactHash(existing.value),
          normalized: existing.value_normalized ?? normalize(existing.value),
        })
      ) {
        const bumpedConfidence = Math.max(existing.confidence, Math.min(1, confidence))
        const nextSource = source ?? existing.source ?? null
        this.db
          .prepare(
            `UPDATE user_facts SET source = ?, confidence = ?, updated_at = ?, last_accessed_at = ? WHERE id = ?`,
          )
          .run(nextSource, bumpedConfidence, ts, ts, existing.id)
        return {
          fact: { ...existing, source: nextSource ?? undefined, confidence: bumpedConfidence, updated_at: ts, last_accessed_at: ts },
          merged: true,
        }
      }
    }

    // Fresh insert.
    const fact: UserFact = {
      id: randomUUID(),
      key,
      value,
      source,
      confidence: Math.max(0, Math.min(1, confidence)),
      created_at: ts,
      updated_at: ts,
      last_accessed_at: ts,
      content_hash: hash,
      value_normalized: valueNorm,
    }
    this.db
      .prepare(
        `INSERT INTO user_facts (id, key, value, source, confidence, created_at, updated_at, last_accessed_at, content_hash, value_normalized) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        fact.id,
        fact.key,
        fact.value,
        fact.source ?? null,
        fact.confidence,
        fact.created_at,
        fact.updated_at,
        fact.last_accessed_at ?? ts,
        fact.content_hash ?? null,
        fact.value_normalized ?? null,
      )
    return { fact, merged: false }
  }

  /**
   * Convenience wrapper that returns just the `UserFact` (ignoring the
   * `merged` flag). Useful for callers that only care about the resulting
   * row, not whether a dedup hit occurred.
   */
  recordUserFactSimple(key: string, value: string, source?: string, confidence = 1.0): UserFact {
    return this.recordUserFact(key, value, source, confidence).fact
  }

  getUserFacts(minConfidence?: number): UserFact[] {
    const all = this.db.prepare(`SELECT * FROM user_facts ORDER BY updated_at DESC`).all() as UserFact[]
    const threshold = minConfidence ?? 0
    const kept: UserFact[] = []
    for (const f of all) {
      if (f.confidence < threshold) {
        this.db.prepare(`DELETE FROM user_facts WHERE id = ?`).run(f.id)
      } else {
        kept.push(f)
      }
    }
    return kept
  }

  getTopFacts(limit = 5, minConfidence = 0.5): UserFact[] {
    return (
      this.db
        .prepare(`SELECT * FROM user_facts WHERE confidence >= ? ORDER BY confidence DESC, updated_at DESC LIMIT ?`)
        .all(minConfidence, limit) as UserFact[]
    )
  }

  /** Bump last_accessed_at (called by search/recall hot path). */
  touchUserFact(id: string): void {
    this.db.prepare(`UPDATE user_facts SET last_accessed_at = ? WHERE id = ?`).run(now(), id)
  }

  adjustConfidence(key: string, delta: number): UserFact | null {
    const existing = this.db.prepare(`SELECT * FROM user_facts WHERE key = ?`).get(key) as UserFact | undefined
    if (!existing) return null
    const next = Math.max(0, Math.min(1, existing.confidence + delta))
    this.db.prepare(`UPDATE user_facts SET confidence = ?, updated_at = ? WHERE key = ?`).run(next, now(), key)
    return { ...existing, confidence: next, updated_at: now() }
  }

  /**
   * Apply exp decay to every user fact based on its `last_accessed_at`
   * (falling back to `created_at`). Writes the new confidence + bumps
   * `updated_at` so the decay is observable.
   *
   * Caller is expected to invoke this on a cron — the cfada01 confidence-
   * decay pipeline makes decay a scheduled event, not a per-read side effect.
   */
  runDecay(asOf?: string): { affected: number } {
    const facts = this.db.prepare(`SELECT * FROM user_facts`).all() as UserFact[]
    const ts = now()
    let affected = 0
    const update = this.db.prepare(`UPDATE user_facts SET confidence = ?, updated_at = ? WHERE id = ?`)
    for (const f of facts) {
      const next = decayedConfidence(f, asOf)
      // Skip writes for tiny floating-point drift to keep SQLite WAL churn down.
      if (Math.abs(next - f.confidence) < 0.001) continue
      update.run(next, ts, f.id)
      affected++
    }
    return { affected }
  }

  deleteUserFact(key: string): boolean {
    const result = this.db.prepare(`DELETE FROM user_facts WHERE key = ?`).run(key)
    return result.changes > 0
  }

  getRecentSkillStats(limit = 20): Array<{ skillId: string; total: number; recent: number }> {
    const rows = this.db
      .prepare(
        `SELECT skill_id, COUNT(*) as total, SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) as recent FROM skills_memory GROUP BY skill_id ORDER BY recent DESC, total DESC LIMIT ?`,
      )
      .all(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), limit) as Array<{
      skill_id: string
      total: number
      recent: number
    }>
    return rows.map((r) => ({ skillId: r.skill_id, total: r.total, recent: r.recent }))
  }

  deleteSession(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM sessions WHERE id = ?`).run(id)
    return result.changes > 0
  }

  // --- Artifacts ---

  saveArtifact(opts: { title: string; content: string; sourceSession?: string; tags?: string[] }): Artifact {
    const id = randomUUID()
    const tags = opts.tags?.join(", ") ?? null
    this.db
      .prepare(`INSERT INTO artifacts (id, title, content, source_session, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(id, opts.title, opts.content, opts.sourceSession ?? null, tags, now())
    return { id, title: opts.title, content: opts.content, source_session: opts.sourceSession ?? undefined, tags: tags ?? undefined, created_at: now() }
  }

  getArtifact(id: string): Artifact | null {
    return (this.db.prepare(`SELECT * FROM artifacts WHERE id = ?`).get(id) as Artifact | undefined) ?? null
  }

  searchArtifacts(query: string, limit = 10): Artifact[] {
    return this.db
      .prepare(`SELECT a.* FROM artifact_fts f JOIN artifacts a ON f.id = a.id WHERE artifact_fts MATCH ? ORDER BY rank LIMIT ?`)
      .all(query, limit) as Artifact[]
  }

  listArtifacts(limit = 20): Artifact[] {
    return this.db.prepare(`SELECT * FROM artifacts ORDER BY created_at DESC LIMIT ?`).all(limit) as Artifact[]
  }

  deleteArtifact(id: string): boolean {
    const result = this.db.prepare(`DELETE FROM artifacts WHERE id = ?`).run(id)
    return result.changes > 0
  }

  recordSkillObservation(skillId: string, observation: string, sessionId?: string): SkillObservation {
    const obs: SkillObservation = {
      id: randomUUID(),
      skill_id: skillId,
      session_id: sessionId,
      observation,
      created_at: now(),
    }
    this.db
      .prepare(`INSERT INTO skills_memory (id, skill_id, session_id, observation, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(obs.id, obs.skill_id, obs.session_id ?? null, obs.observation, obs.created_at)
    return obs
  }

  getSkillObservations(skillId: string, limit = 20): SkillObservation[] {
    return this.db.prepare(`SELECT * FROM skills_memory WHERE skill_id = ? ORDER BY created_at DESC LIMIT ?`).all(skillId, limit) as SkillObservation[]
  }

  // --- Feedback ---

  recordFeedback(opts: {
    note?: string
    rating?: "up" | "down"
    category?: string
    sessionId?: string
    messageId?: string
    source?: string
  }): Feedback {
    const fb: Feedback = {
      id: randomUUID(),
      session_id: opts.sessionId,
      message_id: opts.messageId,
      rating: opts.rating,
      category: opts.category,
      note: opts.note,
      source: opts.source ?? "cli",
      created_at: now(),
    }
    this.db
      .prepare(`INSERT INTO feedback (id, session_id, message_id, rating, category, note, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(fb.id, fb.session_id ?? null, fb.message_id ?? null, fb.rating ?? null, fb.category ?? null, fb.note ?? null, fb.source, fb.created_at)
    return fb
  }

  listFeedback(limit = 50): Feedback[] {
    return this.db.prepare(`SELECT * FROM feedback ORDER BY created_at DESC LIMIT ?`).all(limit) as Feedback[]
  }

  feedbackStats(): { total: number; up: number; down: number } {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN rating = 'up' THEN 1 ELSE 0 END) AS up, SUM(CASE WHEN rating = 'down' THEN 1 ELSE 0 END) AS down FROM feedback`)
      .get() as { total: number; up: number | null; down: number | null }
    return { total: row.total ?? 0, up: row.up ?? 0, down: row.down ?? 0 }
  }

  createCouncilSession(opts: {
    prompt: string
    context?: string
    vote_mode: string
    rounds: number
    judge_model?: string
  }): AgentCouncilSession {
    const session: AgentCouncilSession = {
      id: randomUUID(),
      prompt: opts.prompt,
      context: opts.context,
      vote_mode: opts.vote_mode,
      rounds: opts.rounds,
      judge_model: opts.judge_model,
      status: "running",
      created_at: now(),
      updated_at: now(),
    }
    this.db
      .prepare(`INSERT INTO agent_council_sessions (id, prompt, context, vote_mode, rounds, judge_model, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        session.id,
        session.prompt,
        session.context ?? null,
        session.vote_mode,
        session.rounds,
        session.judge_model ?? null,
        session.status,
        session.created_at,
        session.updated_at,
      )
    return session
  }

  recordCouncilMessage(opts: {
    council_id: string
    agent_model: string
    phase: AgentCouncilMessage["phase"]
    content?: string
    input_tokens?: number
    output_tokens?: number
    error?: string
  }): AgentCouncilMessage {
    const message: AgentCouncilMessage = {
      id: randomUUID(),
      council_id: opts.council_id,
      agent_model: opts.agent_model,
      phase: opts.phase,
      content: opts.content,
      input_tokens: opts.input_tokens ?? 0,
      output_tokens: opts.output_tokens ?? 0,
      error: opts.error,
      created_at: now(),
    }
    this.db
      .prepare(`INSERT INTO agent_council_messages (id, council_id, agent_model, phase, content, input_tokens, output_tokens, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        message.id,
        message.council_id,
        message.agent_model,
        message.phase,
        message.content ?? null,
        message.input_tokens,
        message.output_tokens,
        message.error ?? null,
        message.created_at,
      )
    return message
  }

  recordCouncilVote(opts: {
    council_id: string
    agent_model: string
    vote?: string
    justification?: string
    raw: string
  }): AgentCouncilVote {
    const vote: AgentCouncilVote = {
      id: randomUUID(),
      council_id: opts.council_id,
      agent_model: opts.agent_model,
      vote: opts.vote,
      justification: opts.justification,
      raw: opts.raw,
      created_at: now(),
    }
    this.db
      .prepare(`INSERT INTO agent_council_votes (id, council_id, agent_model, vote, justification, raw, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(vote.id, vote.council_id, vote.agent_model, vote.vote ?? null, vote.justification ?? null, vote.raw, vote.created_at)
    return vote
  }

  finalizeCouncilSession(id: string, opts: {
    status: AgentCouncilSession["status"]
    winner_model?: string
    winner?: string
  }): void {
    this.db
      .prepare(`UPDATE agent_council_sessions SET status = ?, winner_model = ?, winner = ?, updated_at = ? WHERE id = ?`)
      .run(opts.status, opts.winner_model ?? null, opts.winner ?? null, now(), id)
  }

  getCouncilSession(id: string): AgentCouncilSession | null {
    return (this.db.prepare(`SELECT * FROM agent_council_sessions WHERE id = ?`).get(id) as AgentCouncilSession | undefined) ?? null
  }

  listCouncilMessages(councilId: string): AgentCouncilMessage[] {
    return this.db
      .prepare(`SELECT * FROM agent_council_messages WHERE council_id = ? ORDER BY created_at ASC`)
      .all(councilId) as AgentCouncilMessage[]
  }

  listCouncilVotes(councilId: string): AgentCouncilVote[] {
    return this.db
      .prepare(`SELECT * FROM agent_council_votes WHERE council_id = ? ORDER BY created_at ASC`)
      .all(councilId) as AgentCouncilVote[]
  }

  /**
   * Run `fn` inside a SQLite IMMEDIATE write transaction with busy-timeout
   * contention. Concurrent writers block up to `WRITE_LOCK_TIMEOUT_MS`,
   * then `SQLITE_BUSY` propagates.
   *
   * Direction 5.5 (session lock): we don't have cross-process coordination
   * at this layer (that's session-lock.ts in the engine), but we DO need
   * concurrent writers from the same process to serialize — otherwise two
   * recordUserFact() calls can race on the dedup scan and double-insert.
   */
  withWriteLock<T>(fn: () => T): T {
    return this.db.transaction(fn).immediate() as T
  }
}
