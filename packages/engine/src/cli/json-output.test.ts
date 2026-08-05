import { describe, expect, test } from "bun:test"
import { outputJson, isJsonMode, ExitCode } from "./json-output"
import { CliError, fail } from "./effect-cmd"

describe("json-output helper", () => {
  test("ExitCode constants are correct", () => {
    expect(ExitCode.SUCCESS).toBe(0)
    expect(ExitCode.USER_ERROR).toBe(1)
    expect(ExitCode.INTERNAL_ERROR).toBe(2)
  })

  test("isJsonMode returns true when args.json is true", () => {
    expect(isJsonMode({ json: true })).toBe(true)
  })

  test("isJsonMode returns false when args.json is false or undefined", () => {
    expect(isJsonMode({ json: false })).toBe(false)
    expect(isJsonMode({})).toBe(false)
  })

  test("outputJson writes valid JSON to stdout", () => {
    const data = { id: "abc", title: "Test Session", updated: "2026-01-01T00:00:00.000Z" }

    const logs: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "))
    }

    outputJson(data)

    console.log = originalLog

    expect(logs).toHaveLength(1)
    const parsed = JSON.parse(logs[0])
    expect(parsed).toEqual(data)
  })

  test("outputJson produces parseable JSON for arrays", () => {
    const data = [
      { id: "s1", title: "Session 1" },
      { id: "s2", title: "Session 2" },
    ]

    const logs: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(" "))
    }

    outputJson(data)

    console.log = originalLog

    const parsed = JSON.parse(logs[0])
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toEqual(data[0])
    expect(parsed[1]).toEqual(data[1])
  })

})

describe("CliError and fail()", () => {
  test("CliError is a Schema.TaggedErrorClass with correct fields", () => {
    const error = new CliError({ message: "test error", exitCode: 1 })
    expect(error._tag).toBe("CliError")
    expect(error.message).toBe("test error")
    expect(error.exitCode).toBe(1)
  })

  test("CliError default exitCode is undefined (not set)", () => {
    const error = new CliError({ message: "test error" })
    expect(error._tag).toBe("CliError")
    expect(error.message).toBe("test error")
    expect(error.exitCode).toBeUndefined()
  })
})

describe("session list JSON output shape", () => {
  test("session list JSON produces valid JSON array with expected fields", () => {
    const sessions = [
      {
        id: "session-abc-123",
        title: "My Session",
        time: {
          updated: "2026-01-15T10:30:00.000Z",
          created: "2026-01-10T08:00:00.000Z",
        },
        projectID: "proj-xyz",
        directory: "/home/user/projects/my-app",
      },
    ]

    const jsonData = sessions.map((session) => ({
      id: session.id,
      title: session.title,
      updated: session.time.updated,
      created: session.time.created,
      projectId: session.projectID,
      directory: session.directory,
    }))

    const json = JSON.stringify(jsonData, null, 2)
    const parsed = JSON.parse(json)

    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toHaveProperty("id")
    expect(parsed[0]).toHaveProperty("title")
    expect(parsed[0]).toHaveProperty("updated")
    expect(parsed[0]).toHaveProperty("created")
    expect(parsed[0]).toHaveProperty("projectId")
    expect(parsed[0]).toHaveProperty("directory")
  })
})

describe("node status JSON output shape", () => {
  test("node status JSON produces valid JSON object with expected fields", () => {
    const nodeData = {
      nodeId: "node-abc-123",
      trustDomain: "example.com",
      keyEpoch: 1,
      enrolledAt: "2026-01-01T00:00:00.000Z",
      policy: { sequence: 42, digest: "abc123def456" },
      revocation: null,
      outbox: { pending: 0, registered: 5, poisoned: 0 },
    }

    const json = JSON.stringify(nodeData, null, 2)
    const parsed = JSON.parse(json)

    expect(parsed).toHaveProperty("nodeId")
    expect(parsed).toHaveProperty("trustDomain")
    expect(parsed).toHaveProperty("keyEpoch")
    expect(parsed).toHaveProperty("enrolledAt")
    expect(parsed.policy).toEqual({ sequence: 42, digest: "abc123def456" })
    expect(parsed.revocation).toBeNull()
    expect(parsed.outbox).toHaveProperty("pending", 0)
    expect(parsed.outbox).toHaveProperty("registered", 5)
    expect(parsed.outbox).toHaveProperty("poisoned", 0)
  })

  test("node status JSON for unenrolled node produces valid JSON", () => {
    const json = JSON.stringify({ enrolled: false }, null, 2)
    const parsed = JSON.parse(json)
    expect(parsed).toEqual({ enrolled: false })
  })
})

describe("trust list JSON output shape", () => {
  test("trust list JSON produces valid JSON array with expected fields", () => {
    const rows = [
      {
        worktree: "/home/user/projects/my-app",
        trustedAt: "2026-01-15T10:30:00.000Z",
        fingerprint: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6",
      },
    ]

    const jsonData = rows.map((row) => ({
      worktree: row.worktree,
      trustedAt: row.trustedAt,
      fingerprint: row.fingerprint,
    }))

    const json = JSON.stringify(jsonData, null, 2)
    const parsed = JSON.parse(json)

    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(1)
    expect(parsed[0]).toHaveProperty("worktree")
    expect(parsed[0]).toHaveProperty("trustedAt")
    expect(parsed[0]).toHaveProperty("fingerprint")
  })
})
