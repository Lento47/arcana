import { PermissionV1 } from "@arcana/core/v1/permission"
import { describe, expect } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { Effect, Layer } from "effect"
import { GrepTool } from "../../src/tool/grep"
import { provideInstance, testInstanceStoreLayer, TestInstance } from "../fixture/fixture"
import { SessionID, MessageID } from "../../src/session/schema"
import { CrossSpawnSpawner } from "@arcana/core/cross-spawn-spawner"
import { Truncate } from "@/tool/truncate"
import { Agent } from "../../src/agent/agent"
import { Ripgrep } from "@arcana/core/ripgrep"
import { FSUtil } from "@arcana/core/fs-util"
import { testEffect } from "../lib/effect"
import { Permission } from "../../src/permission"
import type * as Tool from "../../src/tool/tool"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Git } from "@/git"
import { Filesystem } from "@/util/filesystem"

const toolLayer = (_flags: Partial<RuntimeFlags.Info> = {}) =>
  Layer.mergeAll(
    CrossSpawnSpawner.defaultLayer,
    FSUtil.defaultLayer,
    Ripgrep.defaultLayer,
    Truncate.defaultLayer,
    Agent.defaultLayer,
    Git.defaultLayer,
  )

const it = testEffect(toolLayer())
const rooted = testEffect(Layer.mergeAll(toolLayer(), testInstanceStoreLayer))

const ctx = {
  sessionID: SessionID.make("ses_test"),
  messageID: MessageID.make("msg_test"),
  callID: "",
  agent: "build",
  abort: AbortSignal.any([]),
  messages: [],
  metadata: () => Effect.void,
  ask: () => Effect.void,
}

const root = path.join(__dirname, "../..")
const _full = (p: string) => (process.platform === "win32" ? Filesystem.normalizePath(p) : p)

const _githubBase = <A, E, R>(url: string, self: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previous = process.env.ARCANA_REPO_CLONE_GITHUB_BASE_URL
      process.env.ARCANA_REPO_CLONE_GITHUB_BASE_URL = url
      return previous
    }),
    () => self,
    (previous) =>
      Effect.sync(() => {
        if (previous) process.env.ARCANA_REPO_CLONE_GITHUB_BASE_URL = previous
        else delete process.env.ARCANA_REPO_CLONE_GITHUB_BASE_URL
      }),
  )

const _git = Effect.fn("GrepToolTest.git")(function* (cwd: string, args: string[]) {
  return yield* Effect.promise(async () => {
    const proc = Bun.spawn(["git", ...args], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (code !== 0) throw new Error(stderr.trim() || stdout.trim() || `git ${args.join(" ")} failed`)
    return stdout.trim()
  })
})

describe("tool.grep", () => {
  rooted.live("basic search", () =>
    Effect.gen(function* () {
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* provideInstance(root)(
        grep.execute(
          {
            pattern: "export",
            path: path.join(root, "src/tool"),
            include: "*.ts",
          },
          ctx,
        ),
      )
      expect(result.metadata.matches).toBeGreaterThan(0)
      expect(result.output).toContain("Found")
    }),
  )

  it.instance("no matches returns correct output", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Bun.write(path.join(test.directory, "test.txt"), "hello world"))
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute(
        {
          pattern: "xyznonexistentpatternxyz123",
          path: test.directory,
        },
        ctx,
      )
      expect(result.metadata.matches).toBe(0)
      expect(result.output).toBe("No matches found")
    }),
  )

  it.instance("finds matches in tmp instance", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Bun.write(path.join(test.directory, "test.txt"), "line1\nline2\nline3"))
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute(
        {
          pattern: "line",
          path: test.directory,
        },
        ctx,
      )
      expect(result.metadata.matches).toBeGreaterThan(0)
    }),
  )

  it.instance("does not report an unknown total when results are truncated", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() =>
        Promise.all(
          Array.from({ length: 101 }, (_, index) =>
            Bun.write(path.join(test.directory, `match-${index}.txt`), "needle"),
          ),
        ),
      )
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute(
        { pattern: "needle", path: test.directory, include: "*.txt", maxResults: 100 },
        ctx,
      )

      expect(result.output).toContain("(Results truncated at 100 matches.")
      expect(result.output).toContain("raise maxResults")
      expect(result.output).not.toMatch(/showing \d+ of \d+ matches/)
      expect(result.metadata.limit).toBe(100)
    }),
  )

  it.instance("clamps maxResults to the hard ceiling", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Bun.write(path.join(test.directory, "test.txt"), "line1\nline2\nline3"))
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute({ pattern: "line", path: test.directory, maxResults: 999_999 }, ctx)

      expect(result.metadata.limit).toBe(10_000)
    }),
  )

  it.instance("supports exact file paths", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const file = path.join(test.directory, "test.txt")
      yield* Effect.promise(() => Bun.write(file, "line1\nline2\nline3"))
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute(
        {
          pattern: "line2",
          path: file,
        },
        ctx,
      )
      expect(result.metadata.matches).toBe(1)
      expect(result.output).toContain(file)
      expect(result.output).toContain("Line 2: line2")
    }),
  )

  it.instance("includes context lines around matches", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const file = path.join(test.directory, "test.txt")
      yield* Effect.promise(() => Bun.write(file, "aaa\nbbb\nneedle\nccc\nddd"))
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute({ pattern: "needle", path: file, context: 2 }, ctx)

      expect(result.metadata.matches).toBe(1)
      expect(result.output).toContain("Line 1: aaa")
      expect(result.output).toContain("Line 2: bbb")
      expect(result.output).toContain("Line 3: needle")
      expect(result.output).toContain("Line 4: ccc")
      expect(result.output).toContain("Line 5: ddd")
    }),
  )

  it.instance("counts only matches, not context lines", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const file = path.join(test.directory, "test.txt")
      yield* Effect.promise(() => Bun.write(file, "aaa\nneedle one\nccc\nxxx\nyyy\nneedle two\nzzz"))
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute({ pattern: "needle", path: file, context: 1 }, ctx)

      expect(result.metadata.matches).toBe(2)
      expect(result.output).toContain("Found 2 matches")
      expect(result.output).toContain("Line 3: ccc")
      expect(result.output).toContain("Line 5: yyy")
    }),
  )

  it.instance("clamps context to the supported range", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const file = path.join(test.directory, "test.txt")
      yield* Effect.promise(() => Bun.write(file, "aaa\nneedle\nccc"))
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute({ pattern: "needle", path: file, context: 999 }, ctx)

      expect(result.metadata.matches).toBe(1)
      expect(result.output).toContain("Line 1: aaa")
    }),
  )

  it.instance("excludes files matching the exclude glob", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Bun.write(path.join(test.directory, "keep.ts"), "needle"))
      yield* Effect.promise(() => Bun.write(path.join(test.directory, "skip.test.ts"), "needle"))
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute(
        { pattern: "needle", path: test.directory, include: "*.ts", exclude: "**/*.test.ts" },
        ctx,
      )

      expect(result.metadata.matches).toBe(1)
      expect(result.metadata.files).toBe(1)
      expect(result.output).toContain("keep.ts")
      expect(result.output).not.toContain("skip.test.ts")
    }),
  )

  it.instance("files mode returns paths without matching lines", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Bun.write(path.join(test.directory, "a.txt"), "needle\nneedle"))
      yield* Effect.promise(() => Bun.write(path.join(test.directory, "b.txt"), "needle"))
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute({ pattern: "needle", path: test.directory, mode: "files" }, ctx)

      expect(result.metadata.matches).toBe(3)
      expect(result.metadata.files).toBe(2)
      expect(result.output).toContain("a.txt")
      expect(result.output).toContain("b.txt")
      expect(result.output).not.toContain("Line 1:")
    }),
  )

  it.instance("count mode returns per-file totals", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      yield* Effect.promise(() => Bun.write(path.join(test.directory, "a.txt"), "needle\nneedle"))
      yield* Effect.promise(() => Bun.write(path.join(test.directory, "b.txt"), "needle"))
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute({ pattern: "needle", path: test.directory, mode: "count" }, ctx)

      expect(result.metadata.matches).toBe(3)
      expect(result.output).toContain("a.txt: 2")
      expect(result.output).toContain("b.txt: 1")
    }),
  )

  it.instance("matches whole blocks with multiline enabled", () =>
    Effect.gen(function* () {
      const test = yield* TestInstance
      const file = path.join(test.directory, "test.txt")
      yield* Effect.promise(() => Bun.write(file, "function foo() {\n  return 1\n}\nconst bar = 2"))
      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute(
        { pattern: "function foo\\(\\) \\{[\\s\\S]*?\\n\\}", path: file, multiline: true },
        ctx,
      )

      expect(result.metadata.matches).toBe(1)
      expect(result.output).toContain("return 1")
    }),
  )

  it.instance("does not ask for external_directory when alias path is allowed", () =>
    Effect.gen(function* () {
      if (process.platform === "win32") return

      yield* TestInstance
      const tmp = yield* Effect.acquireRelease(
        Effect.promise(() => fs.mkdtemp(path.join(os.tmpdir(), "opencode-grep-alias-"))),
        (dir) => Effect.promise(() => fs.rm(dir, { recursive: true, force: true })),
      )
      const real = path.join(tmp, "real")
      const alias = path.join(tmp, "alias")
      yield* Effect.promise(() => fs.mkdir(real))
      yield* Effect.promise(() => fs.symlink(real, alias, "dir"))
      yield* Effect.promise(() => Bun.write(path.join(real, "test.txt"), "needle"))

      const ruleset = Permission.fromConfig({
        grep: "allow",
        external_directory: {
          [path.join(alias, "*")]: "allow",
        },
      })
      const requests: Array<Omit<PermissionV1.Request, "id" | "sessionID" | "tool">> = []
      const next: Tool.Context = {
        ...ctx,
        ask: (req) =>
          Effect.sync(() => {
            const needsAsk = req.patterns.some(
              (pattern) => Permission.evaluate(req.permission, pattern, ruleset).action !== "allow",
            )
            if (needsAsk) requests.push(req)
          }),
      }

      const info = yield* GrepTool
      const grep = yield* info.init()
      const result = yield* grep.execute(
        {
          pattern: "needle",
          path: alias,
          include: "*.txt",
        },
        next,
      )

      expect(result.metadata.matches).toBe(1)
      expect(requests.find((req) => req.permission === "external_directory")).toBeUndefined()
    }),
  )
})
