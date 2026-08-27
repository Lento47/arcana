import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  buildHeaderStatusItems,
  fitHeaderStatusItems,
  formatHeaderStatusLabel,
  headerLineDisplayWidth,
  joinHeaderStatus,
  projectGovernedTally,
  projectSessionCharter,
} from "../src/shell/command-spine/session-charter"

describe("projectSessionCharter", () => {
  test("empty / missing input yields no charter", () => {
    expect(projectSessionCharter()).toBeUndefined()
    expect(projectSessionCharter(null)).toBeUndefined()
    expect(projectSessionCharter({})).toBeUndefined()
  })

  test("valid proof + satisfied contract become header chips", () => {
    const charter = projectSessionCharter({
      contractStatus: "satisfied",
      proofLevel: "P3",
      integrityStatus: "VALID",
      traceHealth: "COMPLETE",
    })
    expect(charter).toBeDefined()
    expect(charter!.contract.label).toBe("satisfied")
    expect(charter!.contract.tone).toBe("ok")
    expect(charter!.proof.label).toBe("P3 valid")
    expect(charter!.proof.tone).toBe("ok")
  })

  test("invalid integrity is error-toned proof chip", () => {
    const charter = projectSessionCharter({
      proofLevel: "P1",
      integrityStatus: "INVALID",
    })
    expect(charter!.proof.tone).toBe("error")
    expect(charter!.proof.label).toContain("invalid")
    expect(charter!.contract.label).toBe("none")
  })

  test("header labels are explicit without leaking an empty contract", () => {
    expect(formatHeaderStatusLabel({ key: "live", label: "live" })).toBe("LIVE")
    expect(formatHeaderStatusLabel({ key: "contract", label: "none" })).toBe("")
    expect(formatHeaderStatusLabel({ key: "proof", label: "P1 valid" })).toBe("P1 ✓ verified")
    expect(formatHeaderStatusLabel({ key: "proof", label: "P1 invalid" })).toBe("P1 × invalid")
    expect(formatHeaderStatusLabel({ key: "governed", label: "3 governed | 1 denied" })).toBe("3 governed · 1 denied")
  })

  test("header status line never concatenates tokens", () => {
    const charter = projectSessionCharter({
      contractStatus: "proposed",
      proofLevel: "P1",
      integrityStatus: "VALID",
    })
    const items = buildHeaderStatusItems({
      live: "live",
      liveTone: "ok",
      charter,
      governed: { key: "governed", label: "1 governed", tone: "ok" },
    })
    const line = joinHeaderStatus(items)
    expect(line).toBe("live | proposed | P1 valid | 1 governed")
    expect(line).not.toContain("livecontract")
    expect(line).not.toContain("valid1")
  })

  test("fitHeaderStatusItems drops path then session before live/contract", () => {
    const items = [
      { key: "live", label: "live" },
      { key: "contract", label: "proposed" },
      { key: "path", label: "L:/very/long/path/that/will/not/fit" },
      { key: "session", label: "sess_abcdef" },
      { key: "model", label: "gpt-4.1-mini" },
    ]
    const fitted = fitHeaderStatusItems(items, 28)
    expect(fitted.map((item) => item.key)).toEqual(["live", "contract"])
    expect(headerLineDisplayWidth(fitted)).toBeLessThanOrEqual(28)
  })

  test("governed tally is a header chip, not a chat sentence", () => {
    expect(projectGovernedTally([])).toBeUndefined()
    const tally = projectGovernedTally([
      {
        id: "governance-group:g1",
        kind: "ok",
        label: "governed",
        source: { kind: "governance" },
        children: [
          { kind: "ok", label: "authorized" },
          { kind: "ok", label: "executed" },
          { kind: "fail", label: "denied" },
        ],
      },
    ])
    expect(tally?.key).toBe("governed")
    expect(tally?.label).toBe("3 governed | 1 denied")
    expect(tally?.tone).toBe("error")
  })

  test("session proof row is not injected into the live spine projection", () => {
    const src = readFileSync(
      join(import.meta.dir, "../src/shell/command-spine/use-spine-projection.ts"),
      "utf8",
    )
    expect(src).not.toContain("governanceProofToSpineEntry")
    expect(src).toContain("projectSessionCharter")
    expect(src).toContain("attachProofContinuations")
  })
})
