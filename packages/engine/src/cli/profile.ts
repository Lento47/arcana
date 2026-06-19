const marks: string[] = []
const enabled = () => !!process.env["ARCANA_PROFILE_STARTUP"]

export function mark(name: string) {
  if (!enabled()) return
  performance.mark(name)
  marks.push(name)
}

export function measure(from: string, to: string, label?: string) {
  if (!enabled()) return
  try {
    performance.measure(label ?? `${from} → ${to}`, from, to)
  } catch {
    // measure throws if marks don't exist (e.g. module-load phase skipped)
  }
}

function emit() {
  const allMarks = performance.getEntriesByType("mark")
  const measures = performance.getEntriesByType("measure")

  if (!allMarks.length) return

  process.stderr.write("[profile] Startup phase timings:\n")

  // Print explicit measures (named phases with measure() calls)
  for (const e of measures) {
    process.stderr.write(`[profile] ${e.name.padEnd(50)} ${Math.round(e.duration)}ms\n`)
  }

  // Print mark deltas (time between consecutive marks = what wasn't in a named phase)
  if (allMarks.length >= 2) {
    for (let i = 1; i < allMarks.length; i++) {
      const dur = Math.round(allMarks[i].startTime - allMarks[i-1].startTime)
      const label = `${allMarks[i-1].name} → ${allMarks[i].name}`
      process.stderr.write(`[profile] ${label.padEnd(50)} ${dur}ms\n`)
    }
    const total = Math.round(allMarks[allMarks.length-1].startTime - allMarks[0].startTime)
    process.stderr.write(`[profile] TOTAL${"".padEnd(53)}${total}ms\n`)
  }

  performance.clearMarks()
  performance.clearMeasures()
}

export function flush() {
  if (!enabled() || !marks.length) return
  // Defer to let TUI/console settle
  setTimeout(emit, 0)
}

export function flushSync() {
  if (!enabled() || !marks.length) return
  emit()
}
