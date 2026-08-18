/**
 * Auditor console pure-logic tests.
 */

import { describe, expect, it } from "bun:test"
import {
  truncateHash,
  formatTimestamp,
  mapAuditEvent,
  formatSweepResult,
  parseRetentionSweepNow,
  readApiError,
} from "../core/auditor-console"

describe("auditor-console helpers", () => {
  describe("truncateHash", () => {
    it("returns short strings unchanged", () => {
      expect(truncateHash("abc", 12)).toBe("abc")
    })

    it("truncates long hashes with an ellipsis", () => {
      const long = "a".repeat(64)
      const result = truncateHash(long, 12)
      expect(result.length).toBe(13)
      expect(result.endsWith("…")).toBe(true)
      expect(result.slice(0, 12)).toBe("a".repeat(12))
    })

    it("uses the default max length of 12", () => {
      const long = "b".repeat(20)
      const result = truncateHash(long)
      expect(result.length).toBe(13)
      expect(result.endsWith("…")).toBe(true)
    })
  })

  describe("formatTimestamp", () => {
    it("formats a valid ISO timestamp", () => {
      expect(formatTimestamp("2026-08-04T10:30:00.000Z")).toBe("2026-08-04 10:30:00")
    })

    it("returns the raw string for invalid input", () => {
      expect(formatTimestamp("not-a-date")).toBe("not-a-date")
    })
  })

  describe("mapAuditEvent", () => {
    it("maps all AuditEventSchema fields with truncation", () => {
      const evt = {
        id: "evt-abc123def456ghi789jkl012mno345pqr678stu901vwx234",
        actorUserId: "user-abc123def456ghi789jkl012mno345pqr678stu901vwx234",
        action: "proof.verified",
        resource: "proof://run_01J/archive/arch-abc123def456ghi789jkl012mno345pqr678",
        outcome: "SUCCESS",
        at: "2026-08-04T10:30:00.000Z",
      }
      const mapped = mapAuditEvent(evt)
      expect(mapped.id).toBe(evt.id)
      expect(mapped.idShort).toBe("evt-abc123def456…")
      expect(mapped.actor).toBe(evt.actorUserId)
      expect(mapped.actorShort).toBe("user-abc12…")
      expect(mapped.action).toBe("proof.verified")
      expect(mapped.resource).toBe(evt.resource)
      expect(mapped.resourceShort).toBe("proof://run_01…")
      expect(mapped.outcome).toBe("SUCCESS")
      expect(mapped.at).toBe("2026-08-04 10:30:00")
    })

    it("short values pass through without truncation", () => {
      const evt = {
        id: "short-id",
        actorUserId: "short-user",
        action: "proof.created",
        resource: "res",
        outcome: "FAILURE",
        at: "2026-08-04T10:30:00.000Z",
      }
      const mapped = mapAuditEvent(evt)
      expect(mapped.id).toBe("short-id")
      expect(mapped.actor).toBe("short-user")
      expect(mapped.resource).toBe("res")
    })
  })

  describe("formatSweepResult", () => {
    it("formats deleted-only result", () => {
      expect(formatSweepResult({ deleted: 3, retainedByHold: 0 })).toBe("3 deleted")
    })

    it("formats retained-only result", () => {
      expect(formatSweepResult({ deleted: 0, retainedByHold: 2 })).toBe("2 retained by hold")
    })

    it("formats both counts", () => {
      expect(formatSweepResult({ deleted: 3, retainedByHold: 2 })).toBe("3 deleted, 2 retained by hold")
    })

    it("returns fallback for zero counts", () => {
      expect(formatSweepResult({ deleted: 0, retainedByHold: 0 })).toBe("nothing to sweep")
    })
  })

  describe("readApiError", () => {
    it("joins engine error and detail", async () => {
      const res = new Response(
        JSON.stringify({ error: "engine_unreachable", detail: "ECONNREFUSED" }),
        { status: 502, statusText: "Bad Gateway" },
      )
      expect(await readApiError(res)).toBe("engine_unreachable: ECONNREFUSED")
    })

    it("falls back to the HTTP status for non-JSON bodies", async () => {
      const res = new Response("nope", { status: 500, statusText: "Internal Server Error" })
      expect(await readApiError(res)).toBe("HTTP 500: Internal Server Error")
    })
  })

  describe("parseRetentionSweepNow", () => {
    it("omits now when the field is empty", () => {
      expect(parseRetentionSweepNow()).toEqual({})
      expect(parseRetentionSweepNow("  ")).toEqual({})
    })

    it("rejects a bare day count", () => {
      expect(parseRetentionSweepNow("90").error).toContain("ISO timestamp")
    })

    it("accepts an ISO timestamp", () => {
      expect(parseRetentionSweepNow("2026-08-17T00:00:00Z").now).toBe("2026-08-17T00:00:00.000Z")
    })
  })
})
