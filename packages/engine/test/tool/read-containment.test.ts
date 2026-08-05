/**
 * D-7.1 / BLK-D-02: engine file-read path wired to SafeBoundedFileReader.
 *
 * Hostile-escape fixtures at the REAL boundary: the production `read` tool
 * (the path that reads files on behalf of approvals) must fail closed on
 * traversal, absolute outside paths, null bytes, and junction/reparse-point
 * escapes — not just the core unit reader. Every fixture asserts a typed
 * rejection and that hostile content never reaches the result.
 */

import { PermissionV1 } from "@arcana/core/v1/permission"
import { describe, expect, afterEach } from "bun:test"
import { Cause, Effect, Exit, Layer } from "effect"
import path from "path"
import { symlinkSync, mkdirSync } from "node:fs"
import { Agent } from "../../src/agent/agent"
import { CrossSpawnSpawner } from "@arcana/core/cross-spawn-spawner"
import { FSUtil } from "@arcana/core/fs-util"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { Ripgrep } from "@arcana/core/ripgrep"
import { LSP } from "@/lsp/lsp"
import { SessionID, MessageID } from "../../src/session/schema"
import { Instruction } from "../../src/session/instruction"
import { ReadTool } from "../../src/tool/read"
import { Truncate } from "@/tool/truncate"
import { Tool } from "@/tool/tool"
import { readBoundedFile } from "@/util/bounded-file-read"
import {
  disposeAllInstances,
  provideInstance,
  testInstanceStoreLayer,
  tmpdirScoped,
} from "../fixture/fixture"
import { testEffect } from "../lib/effect"

afterEach(async () => {
  await disposeAllInstances()
})

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

const readLayer = (_flags: Partial<RuntimeFlags.Info> = {}) =>
  Layer.mergeAll(
    Agent.defaultLayer,
    FSUtil.defaultLayer,
    CrossSpawnSpawner.defaultLayer,
    Instruction.defaultLayer,
    LSP.defaultLayer,
    Ripgrep.defaultLayer,
    Truncate.defaultLayer,
  )

const it = testEffect(Layer.mergeAll(readLayer(), testInstanceStoreLayer))

const init = Effect.fn("ReadContainmentTest.init")(function* () {
  const info = yield* ReadTool
  return yield* info.init()
})

const run = Effect.fn("ReadContainmentTest.run")(function* (
  args: Tool.InferParameters<typeof ReadTool>,
  next: Tool.Context = ctx,
) {
  const tool = yield* init()
  return yield* tool.execute(args, next)
})

const exec = Effect.fn("ReadContainmentTest.exec")(function* (
  dir: string,
  args: Tool.InferParameters<typeof ReadTool>,
  next: Tool.Context = ctx,
) {
  return yield* provideInstance(dir)(run(args, next))
})

const fail = Effect.fn("ReadContainmentTest.fail")(function* (
  dir: string,
  args: Tool.InferParameters<typeof ReadTool>,
  next: Tool.Context = ctx,
) {
  const exit = yield* exec(dir, args, next).pipe(Effect.exit)
  if (Exit.isFailure(exit)) {
    const err = Cause.squash(exit.cause)
    return err instanceof Error ? err : new Error(String(err))
  }
  throw new Error("expected read to fail closed")
})

const put = Effect.fn("ReadContainmentTest.put")(function* (p: string, content: string | Buffer | Uint8Array) {
  const fs = yield* FSUtil.Service
  yield* fs.writeWithDirs(p, content)
})

describe("tool.read D-7.1 hostile-escape containment (real boundary)", () => {
  it.live("reads a contained file through the bounded reader", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      yield* put(path.join(dir, "docs", "a.txt"), "hello")

      const result = yield* exec(dir, { filePath: path.join(dir, "docs", "a.txt") })
      expect(result.output).toContain("hello")
      expect(result.metadata.truncated).toBe(false)
    }),
  )

  it.live("rejects traversal that escapes the workspace", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const outside = yield* tmpdirScoped()
      yield* put(path.join(outside, "secret.txt"), "SECRET-TRAVERSAL")
      const rel = path.relative(dir, path.join(outside, "secret.txt"))

      const err = yield* fail(dir, { filePath: rel })
      expect(err.message).toMatch(/traversal/)
      expect(err.message).not.toContain("SECRET-TRAVERSAL")
    }),
  )

  it.live("rejects absolute paths outside the workspace when external approval is denied", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const outside = yield* tmpdirScoped()
      yield* put(path.join(outside, "secret.txt"), "SECRET-ABSOLUTE")
      const denied = {
        ...ctx,
        ask: (req: Omit<PermissionV1.Request, "id" | "sessionID" | "tool">) =>
          Effect.sync(() => {
            if (req.permission === "external_directory") {
              throw new PermissionV1.DeniedError({ ruleset: {} })
            }
          }),
      }

      const err = yield* fail(dir, { filePath: path.join(outside, "secret.txt") }, denied)
      expect(err.message).toMatch(/prevents you from using/)
      expect(err.message).not.toContain("SECRET-ABSOLUTE")
    }),
  )

  it.live("rejects absolute requested paths at the bounded adapter", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const outside = yield* tmpdirScoped()
      yield* put(path.join(outside, "secret.txt"), "SECRET-ADAPTER")

      const exit = yield* readBoundedFile({
        boundaryRoot: dir,
        requestedPath: path.join(outside, "secret.txt"),
        maximumBytes: 64 * 1024,
      }).pipe(Effect.exit)
      expect(Exit.isFailure(exit)).toBe(true)
      if (Exit.isFailure(exit)) {
        const err = Cause.squash(exit.cause)
        expect(err instanceof Error ? err.message : String(err)).toMatch(/absolute path not allowed/)
      }
    }),
  )

  it.live("rejects null bytes in requested paths", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })

      const err = yield* fail(dir, { filePath: `docs/a.txt\0.evil` })
      expect(err.message).toMatch(/null byte/)
    }),
  )

  it.live("rejects junction/symlink escapes out of the workspace", () =>
    Effect.gen(function* () {
      const dir = yield* tmpdirScoped({ git: true })
      const outside = yield* tmpdirScoped()
      yield* put(path.join(outside, "secret.txt"), "SECRET-JUNCTION")

      const link = path.join(dir, "docs", "escape")
      const created = yield* Effect.sync(() => {
        try {
          mkdirSync(path.join(dir, "docs"), { recursive: true })
          symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir")
          return true
        } catch {
          // Platform/CI disallows links; without a link there is nothing to escape through.
          return false
        }
      })
      if (!created) return

      const err = yield* fail(dir, { filePath: path.join(link, "secret.txt") })
      expect(err.message).toMatch(/escapes workspace/)
      expect(err.message).not.toContain("SECRET-JUNCTION")
    }),
  )
})
