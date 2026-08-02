/**
 * Low-cluster quick-win pass #2 (audit §10.21): S11, S13, D8, D9, S14.
 *
 * Source contracts (fail on the old code):
 *  - S11: spine-lead.tsx drops the never-used SpineLeadColumns + spineContentOffset
 *    exports and their now-orphaned imports (JSX, RGBA, SpineKind, SpineRail);
 *    keeps spineLeadMetrics + SpineGutterSpacer (both consumed by prompt/gates).
 *  - S13: SpineListing drops the dead `focused` prop (the identical-branch ternary
 *    was already gone; the prop did nothing). Typecheck enforces the call site.
 *  - D8: which-key.tsx drops the dead _MIN_COLUMN_WIDTH constant and inlines the
 *    hardcoded left={0}.
 *  - D9: spine-entry.tsx grouped burst drops the lone-ellipsis fallback so null
 *    children render nothing.
 *  - S14: repo-root .gitattributes pins eol=lf for the spine directory's ts/tsx,
 *    and no spine source file retains a CR in its working-tree bytes.
 */
import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"

const repoRoot = join(import.meta.dir, "../../..")
const tui = (p: string) =>
  readFileSync(join(import.meta.dir, "../src", p), "utf8").replace(/\r\n/g, "\n")
const tuiRaw = (p: string) => readFileSync(join(import.meta.dir, "../src", p), "utf8")

const lead = tui("shell/command-spine/spine-lead.tsx")
const listing = tui("shell/command-spine/spine-listing.tsx")
const entry = tui("shell/command-spine/spine-entry.tsx")
const whichKey = tui("feature-plugins/system/which-key.tsx")
const attributes = (() => {
  try {
    return readFileSync(join(repoRoot, ".gitattributes"), "utf8")
  } catch {
    return ""
  }
})()

describe("S11 — spine-lead dead exports", () => {
  test("SpineLeadColumns and spineContentOffset are deleted", () => {
    expect(lead).not.toContain("SpineLeadColumns")
    expect(lead).not.toContain("spineContentOffset")
  })
  test("orphaned imports removed, live exports kept", () => {
    expect(lead).not.toContain("import type { JSX }")
    expect(lead).not.toContain("import type { RGBA }")
    expect(lead).not.toContain("SpineKind")
    expect(lead).not.toContain("import { SpineRail }")
    expect(lead).toContain("spineLeadMetrics")
    expect(lead).toContain("SpineGutterSpacer")
    expect(lead).toContain("spineGutterWidth")
  })
})

describe("S13 — SpineListing dead focused prop", () => {
  test("focused prop is removed from the props type", () => {
    expect(listing).not.toContain("focused?")
  })
  test("nameColor has no focused branch", () => {
    expect(listing).toContain("const nameColor = () => theme.text")
    expect(listing).not.toContain("props.focused")
  })
})

describe("D8 — which-key dead constant + hardcoded left", () => {
  test("_MIN_COLUMN_WIDTH is deleted", () => {
    expect(whichKey).not.toContain("_MIN_COLUMN_WIDTH")
  })
  test("left is inlined as 0", () => {
    expect(whichKey).not.toContain("const left = 0")
    expect(whichKey).toContain("left={0}")
  })
})

describe("D9 — grouped burst lone-ellipsis fallback", () => {
  test("fallback is removed; null children render nothing", () => {
    expect(entry).not.toContain("fallback={<text>…</text>}")
    expect(entry).toContain("<Show when={child != null}>")
  })
})

describe("S14 — uniform LF via .gitattributes", () => {
  test("repo-root .gitattributes pins eol=lf for the spine dir", () => {
    expect(attributes).toContain("command-spine/*.ts text eol=lf")
    expect(attributes).toContain("command-spine/*.tsx text eol=lf")
  })
  test("no spine source file retains a CR in the working tree", () => {
    const files = readdirSync(join(import.meta.dir, "../src/shell/command-spine")).filter((f) =>
      f.endsWith(".ts") || f.endsWith(".tsx"),
    )
    const crlf = files.filter((f) =>
      tuiRaw(`shell/command-spine/${f}`).includes("\r"),
    )
    expect(crlf).toEqual([])
  })
})
