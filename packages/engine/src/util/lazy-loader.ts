const cache = new Map<string, any>()
const loading = new Map<string, Promise<any>>()
const LAZY_CACHE_MAX = 50

function evictIfNeeded() {
  if (cache.size <= LAZY_CACHE_MAX) return
  const keys = cache.keys()
  for (let i = 0; i < cache.size - LAZY_CACHE_MAX; i++) {
    const next = keys.next()
    if (next.done) break
    cache.delete(next.value)
    loading.delete(next.value)
  }
}

export function lazyImport<T>(modulePath: string): () => T {
  return () => {
    if (cache.has(modulePath)) return cache.get(modulePath)
    if (!loading.has(modulePath)) {
      loading.set(modulePath, import(modulePath).then(m => {
        evictIfNeeded()
        cache.set(modulePath, m)
        return m
      }))
    }
    return loading.get(modulePath) as any
  }
}

export function createLazyProxy<T extends object>(factory: () => T): T {
  let instance: T | null = null
  return new Proxy({} as T, {
    get(_, prop) { if (!instance) instance = factory(); return (instance as any)[prop] },
  })
}
