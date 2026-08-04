// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import { describe, expect, test } from "bun:test"

import {
  bashCompletionScript,
  fishCompletionScript,
  getCompletionScript,
  zshCompletionScript,
} from "./completion.js"

const SUBCOMMANDS = [
  "run",
  "skills",
  "cron",
  "memory",
  "gateway",
  "config",
  "learn",
  "doctor",
  "history",
  "theme",
  "feedback",
  "web",
  "daemon",
  "completion",
]

describe("Completion scripts", () => {
  test("bash completion script is non-empty and has correct structure", () => {
    const script = bashCompletionScript()
    expect(script).toBeTruthy()
    expect(script.length).toBeGreaterThan(0)
    expect(script).toContain("###-begin-arcana-completions-###")
    expect(script).toContain("###-end-arcana-completions-###")
    expect(script).toContain("_arcana_yargs_completions")
    expect(script).toContain("complete -o bashdefault")
  })

  test("zsh completion script is non-empty and contains all subcommands", () => {
    const script = zshCompletionScript()
    expect(script).toBeTruthy()
    expect(script.length).toBeGreaterThan(0)
    for (const cmd of SUBCOMMANDS) {
      expect(script).toContain(cmd)
    }
    expect(script).toContain("#compdef arcana")
  })

  test("fish completion script is non-empty and contains all subcommands", () => {
    const script = fishCompletionScript()
    expect(script).toBeTruthy()
    expect(script.length).toBeGreaterThan(0)
    for (const cmd of SUBCOMMANDS) {
      expect(script).toContain(cmd)
    }
    expect(script).toContain("complete -c arcana")
  })

  test("fish completion script uses valid fish syntax for subcommands", () => {
    const script = fishCompletionScript()
    const lines = script.split("\n")
    for (const line of lines) {
      if (line.trim().startsWith("complete -c arcana") && line.includes("-n '__fish_use_subcommand'")) {
        expect(line).toMatch(/^complete -c arcana -f -n '__fish_use_subcommand' -a '/)
      }
    }
  })

  test("getCompletionScript returns bash for 'bash' argument", () => {
    const script = getCompletionScript("bash")
    expect(script).toBeTruthy()
    expect(script).toContain("###-begin-arcana-completions-###")
  })

  test("getCompletionScript returns zsh for 'zsh' argument", () => {
    const script = getCompletionScript("zsh")
    expect(script).toBeTruthy()
    expect(script).toContain("#compdef arcana")
  })

  test("getCompletionScript returns fish for 'fish' argument", () => {
    const script = getCompletionScript("fish")
    expect(script).toBeTruthy()
    expect(script).toContain("complete -c arcana")
  })

  test("getCompletionScript returns undefined for unsupported shell", () => {
    expect(getCompletionScript("powershell")).toBeUndefined()
  })
})
