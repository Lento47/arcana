import { describe, expect, test } from "bun:test"
import { mkdtempSync, existsSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  applyLearningExtraction,
  fallbackExtraction,
  learningHasEntries,
  parseLearningJson,
  runStatusFromReason,
  shouldExtractLearnings,
} from "../../src/session/learn-runtime"

describe("learn-runtime", () => {
  test("parses fenced JSON and ignores junk", () => {
    const parsed = parseLearningJson(`here\n\`\`\`json\n{"facts":[{"slug":"a","summary":"s","body":"b","tags":["t"]}],"patterns":[],"mistakes":[],"preferenceUpdates":[]}\n\`\`\``)
    expect(parsed?.facts[0]?.slug).toBe("a")
    expect(parseLearningJson("not json")).toBeUndefined()
  })

  test("verified vs unproven from completion reason", () => {
    expect(runStatusFromReason("normal")).toBe("verified")
    expect(runStatusFromReason("graceful_failure")).toBe("verified")
    expect(runStatusFromReason("cancelled")).toBe("unproven")
    expect(runStatusFromReason("drive_exhausted")).toBe("unproven")
  })

  test("skips short sessions", () => {
    expect(shouldExtractLearnings(1)).toBe(false)
    expect(shouldExtractLearnings(2)).toBe(true)
  })

  test("applyLearningExtraction writes LEARNED.md on verified runs", () => {
    const root = mkdtempSync(join(tmpdir(), "arcana-learn-"))
    const result = applyLearningExtraction({
      projectRoot: root,
      sessionID: "ses_test",
      reason: "normal",
      extraction: fallbackExtraction("Ship the drive loop"),
    })
    expect(result.learnedMdUpdated).toBe(true)
    expect(result.wikiFilesCreated.length).toBe(1)
    expect(existsSync(join(root, ".arcana", "LEARNED.md"))).toBe(true)
    expect(readFileSync(join(root, ".arcana", "LEARNED.md"), "utf8")).toContain("Ship the drive loop")
  })

  test("unproven runs go to quarantine", () => {
    const root = mkdtempSync(join(tmpdir(), "arcana-learn-"))
    const result = applyLearningExtraction({
      projectRoot: root,
      sessionID: "ses_fail",
      reason: "cancelled",
      extraction: fallbackExtraction("Did not finish"),
    })
    expect(result.runStatus).toBe("unproven")
    expect(learningHasEntries(fallbackExtraction("x"))).toBe(true)
    expect(existsSync(join(root, ".arcana", "LEARNED.md"))).toBe(false)
    expect(result.wikiFilesCreated.some((path) => path.includes(".quarantine"))).toBe(true)
  })
})
