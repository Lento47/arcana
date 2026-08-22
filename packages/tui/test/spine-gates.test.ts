import { describe, expect, test } from "bun:test"
import {
  isLocalPermissionRequest,
  pendingGateEntries,
  permissionDecisionSurface,
} from "../src/shell/command-spine/spine-gates"

describe("command-spine pending gates", () => {
  test("permission requests become approve entries", () => {
    const entries = pendingGateEntries({
      permissions: [
        {
          id: "perm-1",
          sessionID: "sess-1",
          permission: "edit",
          patterns: ["src/auth/*"],
          metadata: {},
          always: ["src/auth/*"],
          tool: { messageID: "msg-1", callID: "call-1" },
        },
      ],
      questions: [],
    })

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      id: "permission:perm-1",
      kind: "approve",
      label: "approve",
      actor: "operator",
      summary: "Edit approval required: src/auth/*",
      bodyLabel: "approval gate",
      source: { messageID: "msg-1", partID: "call-1", kind: "approve" },
    })
    expect(entries[0]!.body).toContain("Permission: edit")
    expect(entries[0]!.body).toContain("- src/auth/*")
  })

  test("question requests become question entries", () => {
    const entries = pendingGateEntries({
      permissions: [],
      questions: [
        {
          id: "question-1",
          sessionID: "sess-1",
          questions: [
            {
              header: "Risk",
              question: "Approve dependency install?",
              options: [
                { label: "Allow once", description: "Run this command once." },
                { label: "Reject", description: "Stop the action." },
              ],
            },
          ],
          tool: { messageID: "msg-2", callID: "call-2" },
        },
      ],
    })

    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      id: "question:question-1",
      kind: "question",
      label: "question",
      actor: "operator",
      summary: "Approve dependency install?",
      bodyLabel: "question gate",
      source: { messageID: "msg-2", partID: "call-2", kind: "question" },
    })
    expect(entries[0]!.body).toContain("1. Risk")
    expect(entries[0]!.body).toContain("- Allow once — Run this command once.")
  })

  test("remote requests remain visible without becoming local action gates", () => {
    const request = {
      id: "perm-remote",
      sessionID: "sess-1",
      permission: "bash",
      patterns: ["deploy *"],
      metadata: {},
      always: [],
      routing: {
        route: "DESKTOP_REQUIRED",
        decisionSurface: "PENDING",
        localFallbackAllowed: false,
        desktopOnline: false,
        policyVersion: "1",
      },
    }
    expect(isLocalPermissionRequest(request)).toBe(false)
    expect(permissionDecisionSurface(request)).toBe("PENDING")
    expect(pendingGateEntries({ permissions: [request], questions: [] })[0]?.summary).toContain("waiting on pending")
  })
})
