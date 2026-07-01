export { openMemoryDB } from "./db.js"
export {
  MemoryStore,
  RECENCY_HALFLIFE_DAYS,
  CONFIDENCE_HALFLIFE_DAYS,
  WRITE_LOCK_TIMEOUT_MS,
  recencyWeight,
  decayedConfidence,
} from "./store.js"
export type {
  Session,
  Message,
  UserFact,
  SkillObservation,
  AgentCouncilSession,
  AgentCouncilMessage,
  AgentCouncilVote,
  SearchResult,
} from "./store.js"
export {
  SHINGLE_K,
  JACCARD_DEDUP_THRESHOLD,
  normalize,
  exactHash,
  tokens,
  shingles,
  jaccard,
  isNearDuplicate,
} from "./dedup.js"
