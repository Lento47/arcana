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

function sessionState(overrides: { status?: unknown; compacting?: boolean; tokens?: unknown } = {}) {
  return {
    provider: [
      {
        id: "prov",
        models: { "model-a": { name: LONG_MODEL, limit: { context: 200_000, output: 32_000 } } },
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

test("a retry is announced", async () => {
  const app = await mountStatusbar(sessionState({ status: { type: "retry" } }), 100)
  try {
    expect(app.captureCharFrame()).toContain("retry")
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
