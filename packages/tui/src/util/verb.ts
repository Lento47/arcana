/** Pick from a verb pool deterministically — same seed = same verb across renders. */
export function pickVerb(pool: readonly string[], seed: string): string {
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0
  }
  return pool[Math.abs(hash) % pool.length]
}
