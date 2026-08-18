import { describe, expect, test } from "bun:test"
import {
  formatInstallApprovedNotice,
  formatInstallResumePrompt,
  noteParkedInstall,
  takeParkedInstall,
} from "./install-notice"

describe("install notice", () => {
  test("take only matches the parked request id", () => {
    noteParkedInstall("sess", "per_1", "npm install -g command-code")
    expect(takeParkedInstall("sess", "per_other")).toBeUndefined()
    const parked = takeParkedInstall("sess", "per_1")
    expect(parked?.command).toBe("npm install -g command-code")
    expect(takeParkedInstall("sess", "per_1")).toBeUndefined()
  })

  test("approved notice tells the model to use the install", () => {
    const text = formatInstallApprovedNotice("npm install -g command-code")
    expect(text).toContain("Operator approved")
    expect(text).toContain("npm install -g command-code")
    expect(text).toContain("Do not ask the user to edit permission JSON")
  })

  test("idle resume prompt is a system reminder", () => {
    const text = formatInstallResumePrompt("npm install -g command-code")
    expect(text).toContain("<system-reminder>")
    expect(text).toContain("approved your parked installation")
  })
})
