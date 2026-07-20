/**
 * Bounded concurrency pool (Promise-based).
 * Guarantees never more than `limit` tasks run at once.
 */

export type PoolStats = {
  maxActive: number
  completed: number
}

/**
 * Run tasks with a concurrency ceiling.
 * `factory(index)` creates a promise for each index in `0..count-1`.
 */
export async function mapPool<T>(
  count: number,
  limit: number,
  factory: (index: number) => Promise<T>,
): Promise<{ results: T[]; stats: PoolStats }> {
  const concurrency = Math.max(1, Math.min(limit, count || 1))
  const results = new Array<T>(count)
  let next = 0
  let active = 0
  let maxActive = 0
  let completed = 0

  await new Promise<void>((resolve, reject) => {
    if (count === 0) {
      resolve()
      return
    }

    const pump = () => {
      while (active < concurrency && next < count) {
        const index = next++
        active++
        maxActive = Math.max(maxActive, active)
        factory(index)
          .then((value) => {
            results[index] = value
            completed++
            active--
            if (completed === count) resolve()
            else pump()
          })
          .catch((error) => {
            reject(error)
          })
      }
    }

    pump()
  })

  return { results, stats: { maxActive, completed } }
}

/** Race a promise against a timeout; clears timer on settle. */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label = "operation"): Promise<T> {
  if (timeoutMs <= 0) return promise
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}
