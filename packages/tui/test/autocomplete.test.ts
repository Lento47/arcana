import { describe, expect, test } from "bun:test"
import { shouldClearSlashOnHide } from "../src/component/prompt/autocomplete"

describe("slash autocomplete hide behavior", () => {
  test("clears only an unfinished slash token", () => {
    expect(shouldClearSlashOnHide("/")).toBe(true)
    expect(shouldClearSlashOnHide("/con")).toBe(true)
    expect(shouldClearSlashOnHide("/contract ")).toBe(false)
    expect(shouldClearSlashOnHide("/contract hello")).toBe(false)
    expect(shouldClearSlashOnHide("/consensus Arcana task")).toBe(false)
  })
})