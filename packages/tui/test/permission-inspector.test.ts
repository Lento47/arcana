import { describe, expect, test } from "bun:test"
import type { PermissionRequest } from "@arcana/sdk/v2"
import { permissionInspectorRows } from "../src/routes/session/permission-inspector"

const request: PermissionRequest = {
  id: "permission-req-1",
  sessionID: "ses_0123456789abcdef0123456789abcdef",
  permission: "contract.accept",
  patterns: ["ses_0123456789abcdef0123456789abcdef"],
  metadata: { description: "Accept the intent contract" },
  always: [],
  tool: {
    messageID: "msg_123",
    callID: "call_456",
  },
}

describe("permission inspector rows", () => {
  test("exposes every exact request field untruncated", () => {
    const rows = permissionInspectorRows(request)
    const byLabel = new Map(rows)
    expect(byLabel.get("Request ID")).toBe("permission-req-1")
    expect(byLabel.get("Session ID")).toBe(request.sessionID)
    expect(byLabel.get("Permission")).toBe("contract.accept")
    expect(byLabel.get("Patterns")).toBe("ses_0123456789abcdef0123456789abcdef")
    expect(byLabel.get("Message ID")).toBe("msg_123")
    expect(byLabel.get("Call ID")).toBe("call_456")
    expect(byLabel.get("Description")).toBe("Accept the intent contract")
  })

  test("defaults patterns to * and omits absent optional rows", () => {
    const rows = permissionInspectorRows({ ...request, patterns: [], tool: undefined, metadata: {} })
    const byLabel = new Map(rows)
    expect(byLabel.get("Patterns")).toBe("*")
    expect(byLabel.has("Message ID")).toBe(false)
    expect(byLabel.has("Call ID")).toBe(false)
    expect(byLabel.has("Description")).toBe(false)
  })
})
