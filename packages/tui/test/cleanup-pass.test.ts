/**
 * Quick-win cleanup pass tests (audit M9, S8, M11, T7).
 *
 * M9: spine-prose codePad dead ternary (identical branches) → constant 1.
 * S8: USE_SAMPLE_SPINE + SAMPLE_ENTRIES debug scaffolding deleted.
 * M11: four `Intl.NumberFormat("en-US", {currency:"USD"})` copies consolidated
 *      into one canonical Locale.currency (default locale, USD).
 * T7: app.tsx code-unit cuts (id.slice(0,10)…slice(-4), label.slice(0,37))
 *      replaced with display-width-aware truncateMiddle/truncate.
 *
 * Currency assertions are deliberately locale-robust (the fix's point is the
 * default locale): no exact "$1,234.56" strings, which would break on a
 * non-en-US machine.
 */
import { describe, expect, test } from "bun:test"
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { currency, truncate, truncateMiddle } from "../src/util/locale"

const read = (p: string) => readFileSync(join(import.meta.dir, p), "utf8")
const spineProseSrc = read("../src/shell/command-spine/spine-prose.tsx")
const shellSrc = read("../src/shell/command-spine/command-spine-shell.tsx")
const indexSrc = read("../src/shell/command-spine/index.ts")
const localeSrc = read("../src/util/locale.ts")
const appSrc = read("../src/app.tsx")
const statusbarSrc = read("../src/feature-plugins/system/statusbar.tsx")
const metricsBarSrc = read("../src/component/prompt/metrics-bar.tsx")
const sidebarCtxSrc = read("../src/feature-plugins/sidebar/context.tsx")
const subagentFooterSrc = read("../src/routes/session/subagent-footer.tsx")

describe("M11 Locale.currency", () => {
  test("non-finite input formats to empty (never a NaN glyph)", () => {
    expect(currency(NaN)).toBe("")
    expect(currency(Infinity)).toBe("")
  })

  test("zero formats with a 0 digit in any locale", () => {
    expect(currency(0)).toContain("0")
  })

  test("positive amounts format non-empty in any locale", () => {
    expect(currency(1.5)).not.toBe("")
  })

  test("canonical formatter lives in locale.ts with no hardcoded locale", () => {
    expect(localeSrc).toContain("export function currency")
    expect(localeSrc).not.toContain('"en-US"')
  })
})

describe("T7 display-width cuts", () => {
  test("compactProofId parity: middle-truncate to 17 columns, head 8 + ellipsis + tail 8", () => {
    expect(truncateMiddle("0123456789ABCDEFGHIJKLMNOP", 17)).toBe("01234567…IJKLMNOP")
  })

  test("compactProofId parity: short ids pass through unchanged", () => {
    expect(truncateMiddle("abc123", 17)).toBe("abc123")
  })

  test("title parity: 45-cell label truncates to 40 cells with the app-standard ellipsis", () => {
    expect(truncate("x".repeat(45), 40)).toBe("x".repeat(39) + "…")
  })

  test("title parity: short labels pass through unchanged", () => {
    expect(truncate("short title", 40)).toBe("short title")
  })
})

describe("M9 dead ternary contract", () => {
  test("codePad is a constant, identical branches gone", () => {
    expect(spineProseSrc).toContain("const codePad = () => 1")
    expect(spineProseSrc).not.toContain("? 1 : 1")
  })
})

describe("S8 scaffolding contract", () => {
  test("shell no longer references the sample spine", () => {
    expect(shellSrc).not.toContain("USE_SAMPLE_SPINE")
    expect(shellSrc).not.toContain("SAMPLE_ENTRIES")
  })

  test("sample-entries.ts file is deleted", () => {
    expect(existsSync(join(import.meta.dir, "../src/shell/command-spine/sample-entries.ts"))).toBe(false)
  })

  test("index.ts no longer re-exports it", () => {
    expect(indexSrc).not.toContain("sample-entries")
  })
})

describe("M11 consolidation contract", () => {
  test("no hardcoded USD currency formatter survives in the four files", () => {
    for (const src of [statusbarSrc, metricsBarSrc, sidebarCtxSrc, subagentFooterSrc]) {
      expect(src).not.toContain("currency: \"USD\"")
    }
  })

  test("all four sites format via Locale.currency", () => {
    expect(statusbarSrc).toContain("Locale.currency")
    expect(metricsBarSrc).toContain("Locale.currency")
    expect(sidebarCtxSrc).toContain("Locale.currency")
    expect(subagentFooterSrc).toContain("Locale.currency")
  })
})

describe("T7 contract", () => {
  test("app.tsx uses the width-aware helpers, code-unit cuts gone", () => {
    expect(appSrc).toContain("truncateMiddle(id, 17)")
    expect(appSrc).toContain("truncate(label, 40)")
    expect(appSrc).not.toContain("id.slice(0, 10)")
    expect(appSrc).not.toContain("label.slice(0, 37)")
  })
})
