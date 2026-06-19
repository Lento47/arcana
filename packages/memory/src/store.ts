import type { Database } from "bun:sqlite"
import { randomUUID } from "node:crypto"

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
}

export type SkillObservation = {
  id: string
  skill_id: string
  session_id?: string
  observation: string
  created_at: string
}

export type SearchResult = {
  type: "session" | "message"
  id: string
  session_id?: string
  rank: number
  snippet: string
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

  search(query: string, limit = 10): SearchResult[] {
    const sessionResults = this.db
      .prepare(`SELECT id, title AS snippet, bm25(session_fts) AS rank FROM session_fts WHERE session_fts MATCH ? ORDER BY rank LIMIT ?`)
      .all(query, limit) as Array<{ id: string; snippet: string; rank: number }>

    const messageResults = this.db
      .prepare(
        `SELECT m.id, m.session_id, SUBSTR(m.content, 1, 200) AS snippet, bm25(message_fts) AS rank FROM message_fts JOIN messages m ON message_fts.id = m.id WHERE message_fts MATCH ? ORDER BY rank LIMIT ?`,
      )
      .all(query, limit) as Array<{ id: string; session_id: string; snippet: string; rank: number }>

    return [
      ...sessionResults.map((r) => ({ type: "session" as const, id: r.id, rank: r.rank, snippet: r.snippet })),
      ...messageResults.map((r) => ({
        type: "message" as const,
        id: r.id,
        session_id: r.session_id,
        rank: r.rank,
        snippet: r.snippet,
      })),
    ].sort((a, b) => a.rank - b.rank)
  }

  recordUserFact(key: string, value: string, source?: string, confidence = 1.0): UserFact {
    const existing = this.db.prepare(`SELECT * FROM user_facts WHERE key = ?`).get(key) as UserFact | undefined
    if (existing) {
      this.db.prepare(`UPDATE user_facts SET value = ?, source = ?, confidence = ?, updated_at = ? WHERE key = ?`).run(value, source ?? null, confidence, now(), key)
      return { ...existing, value, confidence, updated_at: now() }
    }
    const fact: UserFact = {
      id: randomUUID(),
      key,
      value,
      source,
      confidence,
      created_at: now(),
      updated_at: now(),
    }
    this.db
      .prepare(`INSERT INTO user_facts (id, key, value, source, confidence, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(fact.id, fact.key, fact.value, fact.source ?? null, fact.confidence, fact.created_at, fact.updated_at)
    return fact
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

  adjustConfidence(key: string, delta: number): UserFact | null {
    const existing = this.db.prepare(`SELECT * FROM user_facts WHERE key = ?`).get(key) as UserFact | undefined
    if (!existing) return null
    const next = Math.max(0, Math.min(1, existing.confidence + delta))
    this.db.prepare(`UPDATE user_facts SET confidence = ?, updated_at = ? WHERE key = ?`).run(next, now(), key)
    return { ...existing, confidence: next, updated_at: now() }
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
}
