import { afterEach, describe, expect, test } from "bun:test"
import { assertGatewayAllowlist, gatewayOpenMode } from "./gateway.js"

describe("gateway allowlist (ARC-SEC-I06)", () => {
  const prev = process.env.ARCANA_GATEWAY_OPEN

  afterEach(() => {
    if (prev === undefined) delete process.env.ARCANA_GATEWAY_OPEN
    else process.env.ARCANA_GATEWAY_OPEN = prev
  })

  test("refuses empty allowlist by default", () => {
    delete process.env.ARCANA_GATEWAY_OPEN
    expect(() => assertGatewayAllowlist("telegram", undefined)).toThrow(/empty allowlist/)
    expect(() => assertGatewayAllowlist("discord", [])).toThrow(/empty allowlist/)
  })

  test("accepts non-empty allowlist", () => {
    delete process.env.ARCANA_GATEWAY_OPEN
    expect(() => assertGatewayAllowlist("telegram", ["123"])).not.toThrow()
  })

  test("ARCANA_GATEWAY_OPEN bypasses for local dev", () => {
    process.env.ARCANA_GATEWAY_OPEN = "1"
    expect(gatewayOpenMode()).toBe(true)
    expect(() => assertGatewayAllowlist("slack", undefined)).not.toThrow()
  })
})
