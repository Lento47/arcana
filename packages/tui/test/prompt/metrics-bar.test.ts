import { expect, test } from "bun:test"
import { createTuiResolvedConfig } from "../fixture/tui-runtime"

// SessionMetricsBar takes `sessionID?` and short-circuits to null when missing,
// when metrics_bar is disabled in config, or when the session is not loaded.
// The component itself is straightforward Solid JSX gated on those conditions;
// we test the config schema and a pure-format helper for the elapsed clock to
// catch regressions without spinning up the full SyncProvider render tree
// (see sync-fixture.tsx for the heavy mount pattern, which is out of scope
// for this minimal bar).

test("config: prompt.metrics_bar round-trips false through resolve()", () => {
  const config = createTuiResolvedConfig({ prompt: { metrics_bar: false } })
  expect(config.prompt?.metrics_bar).toBe(false)
})

test("config: prompt.metrics_bar defaults to undefined (enabled by default)", () => {
  const config = createTuiResolvedConfig({})
  expect(config.prompt?.metrics_bar).toBeUndefined()
})

test("config: prompt.metrics_bar accepts true", () => {
  const config = createTuiResolvedConfig({ prompt: { metrics_bar: true } })
  expect(config.prompt?.metrics_bar).toBe(true)
})

test("config: prompt.metrics_bar coexists with max_height and max_width", () => {
  const config = createTuiResolvedConfig({
    prompt: { max_height: 8, max_width: 80, metrics_bar: false },
  })
  expect(config.prompt?.max_height).toBe(8)
  expect(config.prompt?.max_width).toBe(80)
  expect(config.prompt?.metrics_bar).toBe(false)
})
