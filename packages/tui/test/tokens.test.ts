/**
 * Wave 1a — token layer.
 *
 * The non-color token layer (`src/ui/chrome.ts`) shipped half-built: `Size`
 * and `Space` existed but the geometry module re-hardcoded their numbers, and
 * four color derivations each had two to four private copies. These tests lock
 * the single-definition claims, because a duplicated token is invisible until
 * someone retunes one copy.
 *
 * Style follows `d10-scroll-policy.test.ts`: pure policy asserted by value,
 * plus source-contract greps for the machinery that must stay deleted.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { RGBA } from "@opentui/core"
import { Size, Space } from "../src/ui/chrome"
import { dialogWidth, homePromptMaxWidth } from "../src/util/geometry"
import { framePadding } from "../src/shell/command-spine/spine-types"
import {
  OVERLAY_ALPHA,
  SCRIM_ALPHA,
  backdropScrim,
  bgLuminance,
  dim,
  fade,
  inkPeak,
  isLightBg,
  logoInk,
  tint,
  withAlpha,
} from "../src/theme/emphasis"
import { DEFAULT_THEMES, fallbackTheme, resolveTheme, selectedForeground } from "../src/theme"
import { contrastingInk } from "../src/theme/contrast"

const SRC = join(import.meta.dir, "../src")

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx?$/.test(name)) out.push(full)
  }
  return out
}

const sources = walk(SRC).map((file) => ({ file, text: readFileSync(file, "utf8") }))
const rel = (file: string) => file.slice(SRC.length + 1).replace(/\\/g, "/")

describe("Size tokens are the single definition of the width caps", () => {
  test("dialogWidth caps at the Size token for every size", () => {
    // 200 cols is wide enough that the cap binds rather than the ratio.
    expect(dialogWidth(200, "medium")).toBe(Size.dialogMedium)
    expect(dialogWidth(200, "large")).toBe(Size.dialogLarge)
    expect(dialogWidth(200, "xlarge")).toBe(Size.dialogXLarge)
  })

  test("dialogWidth never exceeds the terminal or its cap", () => {
    const caps = { medium: Size.dialogMedium, large: Size.dialogLarge, xlarge: Size.dialogXLarge }
    for (const size of ["medium", "large", "xlarge"] as const) {
      for (let w = 1; w <= 240; w++) {
        const got = dialogWidth(w, size)
        expect(got).toBeGreaterThanOrEqual(1)
        expect(got).toBeLessThanOrEqual(Math.min(w, caps[size]))
      }
    }
  })

  test("homePromptMaxWidth floors at Size.promptMaxWidth", () => {
    // 80 cols: 70% is 56, so the floor is what binds.
    expect(homePromptMaxWidth(80)).toBe(Size.promptMaxWidth)
    expect(homePromptMaxWidth(120)).toBe(84) // 70% wins above the floor
  })

  test("homePromptMaxWidth never exceeds the terminal", () => {
    for (let w = 1; w <= 240; w++) {
      expect(homePromptMaxWidth(w)).toBeLessThanOrEqual(w)
      expect(homePromptMaxWidth(w)).toBeGreaterThanOrEqual(1)
    }
  })

  test("geometry.ts no longer carries its own copy of the caps", () => {
    const geometry = sources.find((o) => rel(o.file) === "util/geometry.ts")!
    expect(geometry.text).toContain("DIALOG_WIDTH_CAP")
    expect(geometry.text).not.toContain('size === "xlarge" ? 116')
    expect(geometry.text).not.toContain("Math.max(75,")
  })

  test("Space is consumed rather than duplicated by the shell", () => {
    const spineTypes = sources.find((o) => rel(o.file) === "shell/command-spine/spine-types.ts")!
    expect(spineTypes.text).toContain("Space.frame(density)")
    // The old inline density ladder must not survive beside the token.
    expect(spineTypes.text).not.toContain('density === "compact") return 1')
  })
})

describe("Space.frame is the single definition of density", () => {
  test("framePadding delegates to Space.frame for every density", () => {
    for (const density of ["compact", "cozy", "spacious", undefined] as const) {
      expect(framePadding(density)).toBe(Space.frame(density))
    }
  })

  test("density ordering is compact < cozy < spacious", () => {
    expect(Space.frame("compact")).toBeLessThan(Space.frame("cozy"))
    expect(Space.frame("cozy")).toBeLessThan(Space.frame("spacious"))
  })

  test("an unknown density falls back to cozy rather than 0", () => {
    expect(Space.frame("nonsense" as never)).toBe(Space.frame("cozy"))
  })
})

describe("contrastingInk picks the higher-contrast ink, not the polarity pole", () => {
  test("extremes are unambiguous", () => {
    expect(contrastingInk(RGBA.fromInts(0, 0, 0)).toInts()[0]).toBe(255)
    expect(contrastingInk(RGBA.fromInts(255, 255, 255)).toInts()[0]).toBe(0)
  })

  // 127/255 gray: WCAG luminance ≈ 0.212, between the black/white contrast
  // crossover (0.179) and the polarity midpoint (0.5). Black yields ratio 5.24
  // against it, white 4.00 — so black is correct, while `isLightBg` reads
  // "not light" and the old code therefore picked white.
  const MID_GRAY = RGBA.fromInts(127, 127, 127)

  test("mid-tone surfaces get the ink BT.601 polarity would have missed", () => {
    expect(isLightBg(MID_GRAY)).toBe(false)
    expect(contrastingInk(MID_GRAY).toInts()[0]).toBe(0)
  })

  test("selectedForeground on a transparent theme takes the readable ink", () => {
    const theme = { background: RGBA.fromValues(0, 0, 0, 0), primary: MID_GRAY }
    expect(selectedForeground(theme).toInts()[0]).toBe(0)
  })

  test("an explicit selectedListItemText still wins over the derivation", () => {
    const theme = {
      background: RGBA.fromValues(0, 0, 0, 0),
      primary: MID_GRAY,
      selectedListItemText: RGBA.fromInts(1, 2, 3),
    }
    expect(selectedForeground(theme).toInts().slice(0, 3)).toEqual([1, 2, 3])
  })
})

describe("emphasis primitives", () => {
  test("tint endpoints are exact", () => {
    const a = RGBA.fromInts(10, 20, 30)
    const b = RGBA.fromInts(200, 100, 50)
    expect(tint(a, b, 0).toInts().slice(0, 3)).toEqual([10, 20, 30])
    expect(tint(a, b, 1).toInts().slice(0, 3)).toEqual([200, 100, 50])
  })

  test("isLightBg and bgLuminance agree on polarity", () => {
    const white = RGBA.fromInts(255, 255, 255)
    const black = RGBA.fromInts(0, 0, 0)
    expect(bgLuminance(white)).toBeCloseTo(1, 5)
    expect(bgLuminance(black)).toBeCloseTo(0, 5)
    expect(isLightBg(white)).toBe(true)
    expect(isLightBg(black)).toBe(false)
  })

  test("fade scales alpha and preserves rgb", () => {
    const color = RGBA.fromInts(51, 102, 153)
    const faded = fade(color, 0.5)
    // Alpha quantizes to 8-bit, matching the helper this replaced.
    expect(faded.toInts()[3]).toBe(128)
    expect(faded.toInts().slice(0, 3)).toEqual(color.toInts().slice(0, 3))
  })

  test("withAlpha replaces alpha and round-trips through 8-bit", () => {
    const color = RGBA.fromInts(12, 34, 56)
    const got = withAlpha(color, 186 / 255)
    expect(got.toInts()).toEqual([12, 34, 56, 186])
  })

  test("withAlpha clamps out-of-range alpha instead of throwing", () => {
    const color = RGBA.fromInts(1, 2, 3)
    expect(withAlpha(color, 4).a).toBeCloseTo(1, 5)
    expect(withAlpha(color, -1).a).toBeCloseTo(0, 5)
  })

  test("dim mixes toward the background, reaching the background at 1", () => {
    const theme = { background: RGBA.fromInts(0, 0, 0) }
    const text = RGBA.fromInts(200, 200, 200)
    expect(dim(theme, text, 1).toInts().slice(0, 3)).toEqual([0, 0, 0])
    expect(dim(theme, text, 0).toInts().slice(0, 3)).toEqual([200, 200, 200])
    // Monotone: more dimming is strictly darker against a dark background.
    expect(bgLuminance(dim(theme, text, 0.7))).toBeLessThan(bgLuminance(dim(theme, text, 0.3)))
  })

  test("backdropScrim opposes the background polarity at the shared alpha", () => {
    const dark = { background: RGBA.fromInts(10, 10, 10) }
    const light = { background: RGBA.fromInts(245, 245, 245) }
    // A dark app is receded by lifting, a light one by darkening.
    expect(bgLuminance(backdropScrim(dark))).toBeGreaterThan(0.5)
    expect(bgLuminance(backdropScrim(light))).toBeLessThan(0.5)
    expect(backdropScrim(dark).a).toBeCloseTo(SCRIM_ALPHA, 5)
    expect(backdropScrim(light).a).toBeCloseTo(SCRIM_ALPHA, 5)
  })

  test("overlay alpha is lighter than the scrim so card text stays legible", () => {
    expect(OVERLAY_ALPHA).toBeGreaterThan(SCRIM_ALPHA)
  })

  test("logoInk sits between the background and the text", () => {
    const theme = { background: RGBA.fromInts(0, 0, 0), text: RGBA.fromInts(255, 255, 255) }
    const ink = logoInk(theme)
    expect(bgLuminance(ink)).toBeGreaterThan(bgLuminance(theme.background))
    expect(bgLuminance(ink)).toBeLessThan(bgLuminance(theme.text))
  })

  test("inkPeak picks the pole opposite the ink", () => {
    expect(bgLuminance(inkPeak(RGBA.fromInts(20, 20, 20)))).toBeGreaterThan(0.5)
    expect(bgLuminance(inkPeak(RGBA.fromInts(240, 240, 240)))).toBeLessThan(0.5)
  })
})

describe("fallback theme resolution", () => {
  test("derives from the shipped arcana palette through resolveTheme", () => {
    const expected = resolveTheme(DEFAULT_THEMES.arcana!, "dark")
    const got = fallbackTheme("dark")
    expect(got.background.toInts()).toEqual(expected.background.toInts())
    expect(got.primary.toInts()).toEqual(expected.primary.toInts())
  })

  test("resolves light separately", () => {
    const light = fallbackTheme("light")
    expect(bgLuminance(light.background)).toBeGreaterThan(bgLuminance(fallbackTheme("dark").background))
  })

  test("carries every spine token a chip or gate can reach for", () => {
    const theme = fallbackTheme("dark")
    for (const key of [
      "spineFail",
      "spineOk",
      "spineRun",
      "spineThink",
      "spineContext",
      "spinePatch",
      "spineSubagent",
      "spineAsk",
      "spineInspect",
      "spineGutterElapsed",
      "backgroundElement",
      "textMuted",
      "accent",
      "warning",
      "info",
    ] as const) {
      expect(theme[key]).toBeDefined()
      expect(theme[key].a).toBeGreaterThan(0)
    }
  })

  test("is cached per mode (same instance, no re-resolution)", () => {
    expect(fallbackTheme("dark")).toBe(fallbackTheme("dark"))
  })
})

describe("Wave 1a source contracts", () => {
  test("the BT.601 luminance formula exists in exactly one place", () => {
    const offenders = sources.filter(({ text }) => text.includes("0.299 * ") || text.includes("0.299*"))
    expect(offenders.map((o) => rel(o.file))).toEqual(["theme/emphasis.ts"])
  })

  test("tint is defined only in emphasis.ts and re-exported by the theme module", () => {
    const definitions = sources.filter(({ text }) => /export function tint\(/.test(text))
    expect(definitions.map((o) => rel(o.file))).toEqual(["theme/emphasis.ts"])
  })

  test("the chip fallback is the resolved palette, not a bespoke hex set", () => {
    const chip = sources.find((o) => rel(o.file) === "shell/command-spine/spine-tool-chip.tsx")!
    expect(chip.text).toContain("fallbackTheme()")
    expect(chip.text).not.toContain("FALLBACK_CHIP_THEME")
    expect(chip.text).not.toContain("#8ab07a")
  })

  test("the fatal screen uses the resolved palette, not an emergency hex set", () => {
    const error = sources.find((o) => rel(o.file) === "component/error-component.tsx")!
    expect(error.text).toContain("fallbackTheme(mode ?? \"dark\")")
    expect(error.text).not.toContain("#fab283")
    expect(error.text).not.toContain("#0a0a0a")
  })


  test("the old local de-emphasis helpers are gone", () => {
    const prompt = sources.find((o) => rel(o.file) === "component/prompt/index.tsx")!
    expect(prompt.text).not.toContain("function fadeColor")
    const retry = sources.find((o) => rel(o.file) === "component/dialog-retry-action.tsx")!
    expect(retry.text).not.toContain("FOREGROUND_ALPHA")
    const tree = sources.find((o) => rel(o.file) === "feature-plugins/system/diff-viewer-file-tree.tsx")!
    expect(tree.text).not.toContain("tint(props.theme.text")
  })

  test("the dialog scrim is the shared definition", () => {
    const dialog = sources.find((o) => rel(o.file) === "ui/dialog.tsx")!
    expect(dialog.text).toContain("backdropScrim(theme)")
    expect(dialog.text).not.toContain("150 / 255")
  })

  test("header chrome does not paint separators with border or diff tokens", () => {
    const header = sources.find((o) => rel(o.file) === "shell/command-spine/spine-header.tsx")!
    // `borderSubtle` is protected only to a 2.2 ratio — as text ink the
    // separator renders effectively invisible.
    expect(header.text).not.toContain("fg: props.theme.borderSubtle")
    expect(header.text).not.toContain("fg: props.theme.spineDiffMuted")
    expect(header.text).toContain("fg: props.theme.textMuted")
  })

  test("Size.sidebarWidth is gone — it had no consumer", () => {
    const chrome = sources.find((o) => rel(o.file) === "ui/chrome.ts")!
    expect(chrome.text).not.toContain("sidebarWidth")
  })
})
