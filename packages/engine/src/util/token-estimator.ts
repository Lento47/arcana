import { Token } from "@arcana/core/util/token"

/**
 * Canonical token estimator — single source in core util/token (script-aware).
 * Costing is derived from provider-reported buckets in `Session.getUsage`
 * (models.dev rates + provider-native billing when available); this module
 * deliberately carries no local price table.
 */
export const estimateTokens = Token.estimate
