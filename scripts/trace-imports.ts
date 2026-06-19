// scripts/trace-imports.ts
// Bun-compatible module import tracer.
//
// Usage:
//   bun run scripts/trace-imports.ts packages/engine/src/index.ts
//   bun run scripts/trace-imports.ts packages/arcana/src/index.ts
//
// Loads the entry via dynamic import() and records which modules Bun resolves.
// Since Bun does not expose per-module evaluation hooks natively, this script
// polls require.cache at sub-millisecond intervals during the await import()
// to capture the approximate first-seen time for each newly loaded module.
//
// Falls back to a simple before/after snapshot if polling yields no new entries.

import { resolve } from "path";

const rawEntry = process.argv[2];
if (!rawEntry) {
  console.error("Usage: bun run scripts/trace-imports.ts <entry-file>");
  process.exit(1);
}

/** Resolve the entry to an absolute path so import() resolves correctly. */
const entry = resolve(rawEntry);

// --------------- helpers ---------------

/** Return a Set of all keys currently in require.cache. */
function cacheKeys(): Set<string> {
  return new Set(Object.keys(require.cache));
}

/** Normalise path separators to forward slashes for consistent matching. */
function normSep(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Shorten a path for display, stripping long prefixes. */
function displayPath(p: string): string {
  const n = normSep(p);
  let idx = n.lastIndexOf("node_modules/");
  if (idx !== -1) return n.slice(idx);
  idx = n.lastIndexOf("packages/");
  if (idx !== -1) return n.slice(idx);
  const home = process.env.USERPROFILE || process.env.HOME || "";
  if (home && n.startsWith(normSep(home))) return "~" + n.slice(normSep(home).length);
  return n;
}

// --------------- module tracking ---------------

interface ModuleRecord {
  /** Absolute path as stored in require.cache. */
  path: string;
  /** performance.now() when this key was first observed in the cache. */
  firstSeenMs: number;
}

/** Per-module first-seen times populated by polling. */
const moduleFirstSeen = new Map<string, number>();

/** Collect unhandled rejections so we don't lose the error message. */
let unhandledRejection: any = undefined;
process.on("unhandledRejection", (reason) => {
  unhandledRejection = reason;
});

// --------------- run ---------------

// Snapshot modules that were already loaded before our import.
const baseline = cacheKeys();

const t0 = performance.now();

// Poll require.cache at ~5ms intervals while the import is in flight.
// The event loop yields between synchronous module evaluations, so our
// callbacks fire and capture each module as it enters the registry.
const POLL_INTERVAL_MS = 5;
const pollTimer = setInterval(() => {
  const now = performance.now();
  for (const key of Object.keys(require.cache)) {
    if (!baseline.has(key) && !moduleFirstSeen.has(key)) {
      moduleFirstSeen.set(key, now);
    }
  }
}, POLL_INTERVAL_MS);

let importError: Error | undefined;
try {
  await import(entry);
} catch (e: any) {
  importError = e;
}

clearInterval(pollTimer);
const t1 = performance.now();

// Build the final sorted record list from polling data.
const records: ModuleRecord[] = [];
for (const [path, firstSeenMs] of moduleFirstSeen) {
  records.push({ path, firstSeenMs });
}

// Fallback: if polling caught nothing, do a plain before/after diff.
// This can happen when the import resolves in a single synchronous tick
// (fast modules) or when setInterval has too coarse a resolution.
if (records.length === 0) {
  const afterKeys = cacheKeys();
  for (const key of afterKeys) {
    if (!baseline.has(key)) {
      records.push({ path: key, firstSeenMs: t0 });
    }
  }
}

// Combine import errors.
const errorMessage = importError?.message
  ?? (unhandledRejection ? String(unhandledRejection) : undefined);

// --------------- output ---------------

console.log(`Entry: ${displayPath(entry)}`);
console.log(`Total wall clock: ${Math.round(t1 - t0)}ms`);
console.log(`Modules loaded (new): ${records.length}`);
console.log(`Modules pre-existing in cache: ${baseline.size}`);
console.log(
  `Timing method: ${
    records.length > 0 && records[0].firstSeenMs > t0
      ? `polling (every ${POLL_INTERVAL_MS}ms)`
      : "before/after snapshot"
  }`
);

if (errorMessage) {
  console.log(`\nEntry module error (partial results shown below):`);
  console.log(`  ${errorMessage}`);
}

if (records.length === 0) {
  console.log(`\nNo module details available — require.cache is not accessible.`);
  process.exit(0);
}

// Sort descending by firstSeenMs (modules that appeared latest are displayed
// first — they had the longest wall-clock involvement in the load).
const sorted = [...records].sort((a, b) => {
  const d = b.firstSeenMs - a.firstSeenMs;
  if (d !== 0) return d;
  return a.path.localeCompare(b.path);
});

// Compute relative offsets from the earliest-seen module.
const minSeen = Math.min(...records.map((r) => r.firstSeenMs));

const top = sorted.slice(0, 50);
console.log(`\nTop ${top.length} modules (by first-seen order, latest first):\n`);
for (let i = 0; i < top.length; i++) {
  const m = top[i];
  const offset = Math.round(m.firstSeenMs - minSeen);
  console.log(`  ${String(i + 1).padStart(2)}. ${displayPath(m.path)}  (+${offset}ms)`);
}

if (sorted.length > 50) {
  console.log(`  ... and ${sorted.length - 50} more modules`);
}

// Summary: break down modules by npm package name or local workspace.
const pkgCounts = new Map<string, number>();
for (const r of records) {
  const n = normSep(r.path);
  const nmIdx = n.lastIndexOf("node_modules/");
  if (nmIdx !== -1) {
    // path is .../node_modules/<scope-or-name>/...
    const rest = n.slice(nmIdx + "node_modules/".length);
    // Check for @scope/name pattern
    const pkg = rest.startsWith("@") ? rest.split("/").slice(0, 2).join("/") : rest.split("/")[0];
    pkgCounts.set(pkg, (pkgCounts.get(pkg) ?? 0) + 1);
  } else {
    pkgCounts.set("<local>", (pkgCounts.get("<local>") ?? 0) + 1);
  }
}
console.log(`\nModules by package (top 15):`);
const sortedPkgs = [...pkgCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [pkg, count] of sortedPkgs) {
  console.log(`  ${pkg.padEnd(35)} ${count}`);
}
