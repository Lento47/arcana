import type { MemoryStore } from "@arcana/memory"
import type { ChatMessage } from "./types.js"

export class SessionManager {
  private sessionId: string | null = null
  private messages: ChatMessage[] = []

  constructor(
    private readonly memory: MemoryStore,
    private readonly model: string,
    private readonly provider: string,
  ) {}

  start(systemPrompt: string): string {
    const session = this.memory.createSession({ model: this.model, provider: this.provider })
    this.sessionId = session.id
    this.messages = [{ role: "system", content: systemPrompt }]
    this.memory.addMessage(session.id, "system", systemPrompt)
    return session.id
  }

  /** Resume a previous session — loads messages from durable store. */
  resume(sessionId: string, systemPrompt?: string): boolean {
    const session = this.memory.getSession(sessionId)
    if (!session) return false
    this.sessionId = sessionId
    const dbMessages = this.memory.getMessages(sessionId)
    if (dbMessages.length) {
      this.messages = dbMessages.map((m) => {
        if (m.role === "tool") return { role: "tool" as const, tool_call_id: "", content: m.content }
        if (m.role === "system") return { role: "system" as const, content: m.content }
        if (m.role === "assistant") return { role: "assistant" as const, content: m.content }
        return { role: "user" as const, content: m.content }
      })
    } else if (systemPrompt) {
      this.messages = [{ role: "system", content: systemPrompt }]
    }
    return true
  }

  /** List durable sessions (most recent first). */
  list(limit = 10) {
    return this.memory.listSessions(limit)
  }

  addUser(text: string): void {
    this.messages.push({ role: "user", content: text })
    if (this.sessionId) this.memory.addMessage(this.sessionId, "user", text)
  }

  addAssistant(text: string): void {
    this.messages.push({ role: "assistant", content: text })
    if (this.sessionId) this.memory.addMessage(this.sessionId, "assistant", text)
  }

  getHistory(): ChatMessage[] {
    return this.messages
  }

  updateTitle(title: string): void {
    if (this.sessionId) this.memory.updateSessionTitle(this.sessionId, title)
  }

  id(): string | null {
    return this.sessionId
  }
}
