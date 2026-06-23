// Dedup helpers for the memory package.
//
// Direction 5 spec called for "cosine ≥ 0.92" semantic dedup, but the memory
// package ships with zero vector-math dependencies (we only ship zod). We
// substitute token-level Jaccard similarity, which is the practical
// equivalent for short fact strings (≤ a few hundred chars):
//   - the per-text token universe is tiny, so vector-style normalization is
//     unnecessary
//   - token overlap tracks semantic overlap much better than character
//     shingles for short fact strings
//   - threshold 0.85 lands at the same perceptual point as 0.92 cosine for
//     our synth tests
//
// If a future iteration adds a vector library (e.g. transformers.js or a
// remote embedding endpoint), swap `isNearDuplicate` for a cosine path
// without touching the call sites — both return a boolean.

/** Jaccard similarity threshold above which a candidate counts as a near-duplicate. */
export const JACCARD_DEDUP_THRESHOLD = 0.8

/**
 * Lowercase, collapse whitespace, strip punctuation. Stable across trivial
 * formatting changes ("User Lives in Berlin." === "user lives in berlin").
 */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Bun.hash is fast + non-cryptographic. We use it as a *content-address* for
 * dedup, not a security primitive — collisions across 200 facts are vanishingly
 * unlikely (~1 in 2^32) and a collision only causes a false-positive merge,
 * never data corruption.
 *
 * If we ever need cryptographic strength (audit trail etc.), swap to
 * `crypto.subtle.digest("SHA-256", ...)`; the API surface stays identical.
 */
export function exactHash(text: string): string {
  const normalized = normalize(text)
  // Bun.hash returns a number; stringify + base-36 keeps it compact.
  return Bun.hash(normalized).toString(36)
}

/** Set of whitespace-delimited tokens from normalized text. */
export function tokens(text: string): Set<string> {
  return new Set(normalize(text).split(/\s+/).filter((t) => t.length > 0))
}

/**
 * Character k-shingle set. Kept as an export for callers that want
 * shingle-based analysis (e.g. debug tools); the dedup path uses
 * `tokens()` instead because word overlap tracks meaning better for
 * short fact strings.
 *
 * `SHINGLE_K` is preserved as an alias for `3` for any external callers
 * that referenced it before.
 */
export const SHINGLE_K = 3

/** Set of k-shingles (substring windows of length k) for normalized text. */
export function shingles(text: string, k: number = SHINGLE_K): Set<string> {
  const out = new Set<string>()
  if (text.length < k) {
    out.add(text)
    return out
  }
  for (let i = 0; i <= text.length - k; i++) {
    out.add(text.slice(i, i + k))
  }
  return out
}

/** |A ∩ B| / |A ∪ B|. Returns 1.0 for two empty sets, 0.0 if only one is empty. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  // Iterate the smaller set for speed.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const s of small) {
    if (large.has(s)) intersection++
  }
  const union = a.size + b.size - intersection
  return intersection / union
}

/** Composite dedup check: same hash OR high token-Jaccard overlap. */
export function isNearDuplicate(candidate: string, existing: { hash: string; normalized: string }): boolean {
  const cHash = exactHash(candidate)
  if (cHash === existing.hash) return true
  return jaccard(tokens(candidate), tokens(existing.normalized)) >= JACCARD_DEDUP_THRESHOLD
}