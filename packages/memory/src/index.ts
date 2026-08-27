export { openMemoryDB } from "./db.js"
export { LearningStore } from "./learning-store.js"
export { exportLearningDataset } from "./learning-export.js"
export { runLearningDataCommand } from "./learning-command.js"
export type {
  EffectiveLearningConsent,
  LearningCalibrationRun,
  LearningStoreStatus,
} from "./learning-store.js"
export type { LearningExportOptions, LearningExportResult } from "./learning-export.js"
export type { LearningDataCommandInput, LearningDataCommandResult } from "./learning-command.js"
export {
  MemoryStore,
  RECENCY_HALFLIFE_DAYS,
  CONFIDENCE_HALFLIFE_DAYS,
  WRITE_LOCK_TIMEOUT_MS,
  recencyWeight,
  decayedConfidence,
  isReservedMemoryKey,
  ReservedMemoryKeyError,
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
