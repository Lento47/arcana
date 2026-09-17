/** @jsxImportSource @opentui/solid */
/**
 * The statusbar is a single line of chrome between the transcript and the
 * prompt, and it must stay that tall no matter how much it is asked to show.
 *
 * Nothing rendered it before: the plugin registers `app_bottom` through the
 * slot host, so exercising `View` means standing up that host and mounting the
 * real slot. The bar carries a top border, so "one line" is two terminal rows —
 * the border row plus the content row. A wrapped child would make it three, and
 * that extra row shoves the prompt down the moment a model name gets long
 * enough, which is exactly the movement this surface must never make.
 *
 * The two shells show different bars and both are covered: `opencode` renders
 * the full readout, while `command-spine` renders only context pressure and
 * compaction, so a healthy spine session shows no bar at all.
 */
import { describe, expect, test } from "bun:test"
import { testRender } from "@opentui/solid"
import type { TuiPluginApi, TuiPluginMeta } from "@arcana/plugin/tui"
import type { AssistantMessage, Provider } from "@arcana/sdk/v2"
import { createTuiPluginApi } from "./fixture/tui-plugin"
import { createTuiResolvedConfig } from "./fixture/tui-runtime"
import { TestTuiProviders } from "./fixture/tui-providers"
import { Lexicon } from "../src/branding"
import { Locale } from "../src/util/locale"
import statusbarPlugin, {
  isCompactWidth,
  renderBar,
  retryLabel,
  statusbarWidth,
} from "../src/feature-plugins/system/statusbar"

const pluginMeta = {
  id: "internal:statusbar",
  source: "internal",
  spec: "statusbar",
  target: "statusbar",
  first_time: 0,
  last_time: 0,
  time_changed: 0,
  load_count: 1,
  fingerprint: "test",
  state: "same",
} satisfies TuiPluginMeta

/**
 * The widest single token the bar will ever be handed: 48 display columns with
 * no space to break at, so a wrapping layout has nowhere to wrap and must
 * either clip or grow the bar.
 */
const LONG_MODEL = "claude-sonnet-4-5-20250929-extended-preview-x"

const ASSISTANT = {
  id: "msg_1",
  role: "assistant",
  providerID: "prov",
  modelID: "model-a",
  tokens: { input: 40_000, output: 5_000 },
} as unknown as AssistantMessage

function sessionState(
  overrides: { status?: unknown; compacting?: boolean; tokens?: unknown; contextLimit?: number } = {},
) {
  return {
    provider: [
      {
        id: "prov",
        models: {
          "model-a": { name: LONG_MODEL, limit: { context: overrides.contextLimit ?? 200_000, output: 32_000 } },
        },
      },
    ] as unknown as ReadonlyArray<Provider>,
    config: {},
    session: {
      messages: () => [overrides.tokens ? { ...ASSISTANT, tokens: overrides.tokens } : ASSISTANT],
      get: () => ({ cost: 0.08 }),
      status: () => overrides.status ?? { type: "busy" },
      compacting: () => overrides.compacting ?? false,
    },
  }
}

type Shell = "opencode" | "command-spine"

function statusbarApi(state: Record<string, unknown>, shell: Shell, width: number) {
  const base = createTuiPluginApi()
  return {
    ...base,
    tuiConfig: createTuiResolvedConfig({ shell }),
    // The plugin reads its width from the renderer it is handed, so the stub
    // has to carry one: without it the budget is unmeasured and the test would
    // silently exercise only the no-terminal fallback.
    renderer: { width, on() {}, off() {} },
    route: { current: { name: "session", params: { sessionID: "ses-1" } } },
    state: { ...(base.state as Record<string, unknown>), ...state },
  } as unknown as TuiPluginApi
}

/** Mounts the real `app_bottom` slot through a stub slot host. */
async function mountStatusbar(state: Record<string, unknown>, width: number, shell: Shell = "opencode") {
  let view: (() => unknown) | undefined
  const slots = {
    register(registration: { slots: { app_bottom?: () => unknown } }) {
      view = registration.slots.app_bottom
      return () => {}
    },
  }
  await statusbarPlugin.tui(
    { ...statusbarApi(state, shell, width), slots } as unknown as TuiPluginApi,
    undefined,
    pluginMeta,
  )
  if (!view) throw new Error("statusbar registered no app_bottom slot")

  const app = await testRender(() => <TestTuiProviders>{view!() as never}</TestTuiProviders>, {
    width,
    height: 8,
  })
  for (let attempt = 0; attempt < 40 && app.renderer.root.getChildren().length === 0; attempt++) {
    await Bun.sleep(10)
    await app.renderOnce()
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    await Bun.sleep(20)
    await app.renderOnce()
  }
  return app
}

/** Non-empty frame lines — the bar's real height, ignoring the empty viewport. */
function rows(frame: string): string[] {
  return frame.split("\n").filter((line) => line.trim().length > 0)
}

test("the full bar stays two rows tall with the widest content it will ever hold", async () => {
  // 100 is the breakpoint: at or above it the bar carries every segment,
  // including the token label this asserts on. Below it the decorative meter
  // and the cost give way, which the narrower cases cover instead.
  const app = await mountStatusbar(sessionState(), 100)
  try {
    const lines = rows(app.captureCharFrame())
    // Border row + content row. Three would mean a child wrapped.
    expect(lines.length).toBe(2)
    expect(lines[1]).toContain("CTX")
    expect(lines[1]).toContain(Lexicon.Token.label)
  } finally {
    app.renderer.destroy()
  }
})

test("the bar clips rather than wraps when the terminal is narrower than its content", async () => {
  // 48 columns cannot hold a 48-col model name plus the meter, the token total,
  // and the cost — every one of which the operator asked to see.
  const app = await mountStatusbar(sessionState(), 48)
  try {
    const lines = rows(app.captureCharFrame())
    expect(lines.length).toBe(2)
    // Nothing spilled sideways into a wrap either.
    for (const line of lines) expect(Locale.displayWidth(line)).toBeLessThanOrEqual(48)
  } finally {
    app.renderer.destroy()
  }
})

test("a healthy command-spine session shows no bar at all", async () => {
  const app = await mountStatusbar(sessionState(), 100, "command-spine")
  try {
    // The spine shows its own chrome; this surface only appears to warn.
    expect(rows(app.captureCharFrame()).length).toBe(0)
  } finally {
    app.renderer.destroy()
  }
})

test("compaction is announced in both shells", async () => {
  for (const shell of ["opencode", "command-spine"] as const) {
    const app = await mountStatusbar(sessionState({ compacting: true }), 100, shell)
    try {
      expect(app.captureCharFrame()).toContain("COMPACTING")
    } finally {
      app.renderer.destroy()
    }
  }
})

test("context pressure is announced in both shells", async () => {
  // Tokens at the ceiling: pressure, not compaction, is what raises the chip.
  const state = sessionState({ tokens: { input: 196_000, output: 4_000 } })
  for (const shell of ["opencode", "command-spine"] as const) {
    const app = await mountStatusbar(state, 100, shell)
    try {
      expect(app.captureCharFrame()).toContain("COMPACT NOW")
    } finally {
      app.renderer.destroy()
    }
  }
})

test("the latency budget is named when it, not the window percent, is binding", async () => {
  // 112.1K tokens of a 1M window is 11% — the safety chip must stay silent —
  // but it is past the engine's 96k performance budget, so the bar must show
  // both the budget and the reason a compact is imminent.
  const state = sessionState({ tokens: { input: 112_100, output: 0 }, contextLimit: 1_000_000 })
  const app = await mountStatusbar(state, 100)
  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("CTX")
    expect(frame).toContain("112.1K")
    expect(frame).toContain("96.0K")
    expect(frame).toContain("over budget")
    expect(frame).not.toContain("COMPACT NOW")
    expect(frame).not.toContain("COMPACT SOON")
  } finally {
    app.renderer.destroy()
  }
})

test("a session below the latency budget does not name it", async () => {
  const state = sessionState({ tokens: { input: 45_000, output: 0 }, contextLimit: 1_000_000 })
  const app = await mountStatusbar(state, 100)
  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("45.0K")
    expect(frame).not.toContain("96.0K")
    expect(frame).not.toContain("over budget")
  } finally {
    app.renderer.destroy()
  }
})

test("the spine shell shows the budget explanation before compaction starts", async () => {
  // Without this the spine bar stayed hidden until COMPACTING appeared, so the
  // compact looked unmotivated — the exact report this surfaces.
  const state = sessionState({ tokens: { input: 112_100, output: 0 }, contextLimit: 1_000_000 })
  const app = await mountStatusbar(state, 100, "command-spine")
  try {
    const frame = app.captureCharFrame()
    expect(frame).toContain("112.1K")
    expect(frame).toContain("96.0K")
    expect(frame).toContain("over budget")
  } finally {
    app.renderer.destroy()
  }
})

test("a retry is announced with its attempt and its wait", async () => {
  const app = await mountStatusbar(
    sessionState({ status: { type: "retry", attempt: 2, message: "provider unavailable", next: Date.now() + 5_000 } }),
    100,
  )
  try {
    const frame = app.captureCharFrame()
    // The attempt count and the countdown, not just the word: the retry is the
    // one thing on this bar that moves on its own clock, and "when" is what an
    // operator waiting on it is reading for.
    expect(frame).toContain("retry 2 in ")
    expect(frame).not.toContain("↻")
    // The provider's message stays out of a one-row instrument.
    expect(frame).not.toContain("provider unavailable")
  } finally {
    app.renderer.destroy()
  }
})

/**
 * The width the bar lays out for is read off the renderer a plugin is handed,
 * and a missing measurement must degrade rather than propagate. `NaN` did
 * propagate: the model budget became `NaN`, `Locale.truncate` answers `NaN`
 * with an empty string, and the name vanished from the bar.
 */
/**
 * The retry segment. `↺`/`↻` is the metrics legend's cache read/write pair and
 * the metrics bar is on screen directly above this row, so the rotation mark
 * this segment used to carry meant two things at once.
 */
describe("retry label", () => {
  const NOW = 1_000_000

  test("the countdown on screen actually counts down", async () => {
    // The wait is the only number on this bar that moves without the session
    // sending anything, so it is the only one whose tick has to be proven
    // rather than assumed: a formatter that computes a countdown nobody
    // re-renders is a still image of a countdown.
    const app = await mountStatusbar(
      sessionState({ status: { type: "retry", attempt: 2, next: Date.now() + 30_000 } }),
      100,
    )
    try {
      const wait = (frame: string) => Number.parseInt(/retry 2 in (\d+)s/.exec(frame)?.[1] ?? "", 10)
      const before = wait(app.captureCharFrame())
      expect(before).toBeGreaterThan(20)
      await Bun.sleep(1_200)
      await app.renderOnce()
      const after = wait(app.captureCharFrame())
      // Ranged rather than pinned: the assertion that matters is that the
      // number the operator reads went down, not how far in one sleep.
      expect(after).toBeLessThan(before)
      expect(after).toBeGreaterThan(before - 4)
    } finally {
      app.renderer.destroy()
    }
  })

  test("counts down to the next attempt, then says it is due", () => {
    expect(retryLabel({ attempt: 2, next: NOW + 4_400 }, NOW)).toBe("retry 2 in 5s")
    expect(retryLabel({ attempt: 2, next: NOW + 4_000 }, NOW)).toBe("retry 2 in 4s")
    // A wait that has elapsed, or a clock that has overtaken it, is not a
    // countdown into the negatives.
    expect(retryLabel({ attempt: 2, next: NOW }, NOW)).toBe("retry 2 now")
    expect(retryLabel({ attempt: 2, next: NOW - 30_000 }, NOW)).toBe("retry 2 now")
  })

  test("says only what the status actually carries", () => {
    // The attempt count and the deadline are both optional in practice: an
    // older engine sends neither, and a `retry 1 in 0s` invented here would be
    // a claim about the provider the bar cannot support.
    expect(retryLabel(undefined, NOW)).toBe("retry")
    expect(retryLabel({}, NOW)).toBe("retry")
    expect(retryLabel({ attempt: 3 }, NOW)).toBe("retry 3")
  })
})

describe("responsive gate", () => {
  test("an unmeasured renderer has no width", () => {
    expect(statusbarWidth(undefined)).toBeUndefined()
    expect(statusbarWidth({})).toBeUndefined()
    expect(statusbarWidth({ width: 0 })).toBeUndefined()
    expect(statusbarWidth({ width: -1 })).toBeUndefined()
    expect(statusbarWidth({ width: Number.NaN })).toBeUndefined()
    expect(statusbarWidth({ width: 100 })).toBe(100)
  })

  test("the decorative meter and the cost give way below the breakpoint", () => {
    expect(isCompactWidth(99)).toBe(true)
    expect(isCompactWidth(100)).toBe(false)
    // An unmeasured terminal is not treated as narrow: it keeps the full bar.
    expect(isCompactWidth(undefined)).toBe(false)
  })
})

/**
 * Ten cells quantise the readout to 10% steps, so a meter that had just moved
 * sat on exactly the same cell as one about to leave it. The thresholds that
 * matter — where COMPACT SOON and COMPACT NOW raise — therefore arrived with no
 * warning: 81% and 89% drew the same bar. The boundary cell carries the
 * proof-tape's two "between" marks (`·`, `–`), giving it four densities and the
 * ramp a 2.5% step.
 */
describe("the context meter resolves sub-cell", () => {
  const glyphs = (pct: number) => renderBar(pct).map((seg) => seg.glyph).join("")
  const DENSITY: Record<string, number> = { "▱": 0, "·": 1, "–": 2, "▰": 3 }

  test("the cell being crossed has four densities, not two", () => {
    expect(glyphs(20)).toBe("▰▰▱▱▱▱▱▱▱▱")
    expect(glyphs(23)).toBe("▰▰·▱▱▱▱▱▱▱")
    expect(glyphs(25)).toBe("▰▰–▱▱▱▱▱▱▱")
    // 27% and 25% share a mark; the point is that neither shares one with 20%
    // or with 30%, which is what the ten cells alone forced.
    expect(glyphs(27)).toBe("▰▰–▱▱▱▱▱▱▱")
    expect(glyphs(30)).toBe("▰▰▰▱▱▱▱▱▱▱")
  })

  test("density never rises again once it has fallen", () => {
    // The ramp reads left to right as full cells, at most one partial, then
    // empty — so density is monotone non-increasing. A cell that refilled after
    // emptying would be a hole in the bar. Sweeping all 101 percentages also
    // pins the boundary cell as the only partial one, and that `filled` (which
    // picks the colour) agrees with the mark's density.
    for (let pct = 0; pct <= 100; pct++) {
      const segments = renderBar(pct)
      expect(segments.length).toBe(10)
      let previous = 3
      for (const seg of segments) {
        const density = DENSITY[seg.glyph]
        expect(density).toBeDefined()
        expect(density!).toBeLessThanOrEqual(previous)
        expect(seg.filled).toBe(density! > 0)
        previous = density!
      }
    }
  })

  test("the range is clamped at both ends", () => {
    expect(glyphs(0)).toBe("▱▱▱▱▱▱▱▱▱▱")
    expect(glyphs(100)).toBe("▰▰▰▰▰▰▰▰▰▰")
    expect(glyphs(-5)).toBe("▱▱▱▱▱▱▱▱▱▱")
    expect(glyphs(150)).toBe("▰▰▰▰▰▰▰▰▰▰")
  })

  test("the boundary mark reaches the rendered line", async () => {
    // The unit assertions above would hold even if the bar dropped the mark and
    // drew plain cells, so this reads the frame: 50.0K of 200K is 25%.
    const app = await mountStatusbar(sessionState({ tokens: { input: 49_000, output: 1_000 } }), 100)
    try {
      expect(app.captureCharFrame()).toContain("▰▰–▱▱▱▱▱▱▱")
    } finally {
      app.renderer.destroy()
    }
  })
})
