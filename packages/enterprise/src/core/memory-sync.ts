// Shared memory sync API — push/pull org-wide facts
// Facts are key-value pairs with confidence scores and timestamps

export type SharedFact = {
  key: string
  value: string
  source?: string
  confidence: number
  updated_at: number
  updated_by: string  // user identifier
}

// In-memory store for now — will be replaced with KV/DB
const orgFacts = new Map<string, Map<string, SharedFact>>()

export const MemorySync = {
  getOrgFacts(orgId: string): SharedFact[] {
    const facts = orgFacts.get(orgId)
    if (!facts) return []
    return Array.from(facts.values())
  },

  mergeFacts(orgId: string, incoming: SharedFact[]): { merged: number; conflicts: number } {
    let merged = 0
    let conflicts = 0
    if (!orgFacts.has(orgId)) orgFacts.set(orgId, new Map())
    const existing = orgFacts.get(orgId)!

    for (const fact of incoming) {
      const current = existing.get(fact.key)
      if (!current || fact.updated_at > current.updated_at) {
        existing.set(fact.key, fact)
        merged++
      } else if (fact.updated_at === current.updated_at && fact.value !== current.value) {
        // Same timestamp, different value — conflict
        conflicts++
        // Keep existing (latest from whoever reported first wins ties)
      }
    }
    return { merged, conflicts }
  },

  removeOrgFacts(orgId: string): void {
    orgFacts.delete(orgId)
  },
}
