export * as ConfigCompaction from "./compaction"

import { Schema } from "effect"
import { NonNegativeInt } from "../schema"

export class Keep extends Schema.Class<Keep>("ConfigV2.Compaction.Keep")({
  tokens: NonNegativeInt.pipe(Schema.optional),
}) {}

export class Info extends Schema.Class<Info>("ConfigV2.Compaction")({
  auto: Schema.Boolean.pipe(Schema.optional),
  prune: Schema.Boolean.pipe(Schema.optional),
  keep: Keep.pipe(Schema.optional),
  buffer: NonNegativeInt.pipe(Schema.optional),
  /** Auto-compact at this % of context window (1–100). Default 85 when unset at engine. */
  threshold_percent: NonNegativeInt.pipe(Schema.optional),
  /** Enable the lower, latency-oriented token threshold independently of the safety threshold. */
  performance: Schema.Boolean.pipe(Schema.optional),
  /** Default 96k at the engine. */
  performance_max_input_tokens: NonNegativeInt.pipe(Schema.optional),
  /** Default 64k at the engine. */
  summary_max_input_tokens: NonNegativeInt.pipe(Schema.optional),
}) {}
