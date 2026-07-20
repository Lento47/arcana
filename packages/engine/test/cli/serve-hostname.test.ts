import { describe, expect, test } from "bun:test"
import { isLoopbackHostname } from "../../src/cli/cmd/serve"

describe("serve hostname loopback (ARC-SEC-I08)", () => {
  test("recognizes loopback hosts", () => {
    expect(isLoopbackHostname("127.0.0.1")).toBe(true)
    expect(isLoopbackHostname("localhost")).toBe(true)
    expect(isLoopbackHostname("::1")).toBe(true)
    expect(isLoopbackHostname("[::1]")).toBe(true)
  })

  test("rejects non-loopback binds", () => {
    expect(isLoopbackHostname("0.0.0.0")).toBe(false)
    expect(isLoopbackHostname("192.168.1.10")).toBe(false)
    expect(isLoopbackHostname("example.com")).toBe(false)
  })
})
