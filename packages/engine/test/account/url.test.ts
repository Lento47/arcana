import { describe, expect, test } from "bun:test"
import { normalizeServerUrl, resolveVerificationUrl } from "../../src/account/url"

describe("resolveVerificationUrl", () => {
  test("keeps absolute verification URLs (Arcana site)", () => {
    expect(
      resolveVerificationUrl(
        "https://arcana.otnelhq.com",
        "https://arcana.otnelhq.com/auth/device?code=GJ6S-6J8V",
      ),
    ).toBe("https://arcana.otnelhq.com/auth/device?code=GJ6S-6J8V")
  })

  test("does not double-prefix absolute URLs", () => {
    const bad = resolveVerificationUrl(
      "https://arcana.otnelhq.com",
      "https://arcana.otnelhq.com/auth/device?code=ABCD",
    )
    expect(bad).not.toContain("otnelhq.comhttps")
    expect(bad.startsWith("https://arcana.otnelhq.com/auth/device")).toBe(true)
  })

  test("repairs already double-prefixed URLs", () => {
    expect(
      resolveVerificationUrl(
        "https://arcana.otnelhq.com",
        "https://arcana.otnelhq.comhttps://arcana.otnelhq.com/auth/device?code=GJ6S-6J8V",
      ),
    ).toBe("https://arcana.otnelhq.com/auth/device?code=GJ6S-6J8V")
  })

  test("joins relative paths with server origin (OpenCode style)", () => {
    expect(resolveVerificationUrl("https://one.example.com", "/device?user_code=user-code")).toBe(
      "https://one.example.com/device?user_code=user-code",
    )
  })

  test("joins relative paths without leading slash", () => {
    expect(resolveVerificationUrl("https://one.example.com", "device?code=1")).toBe(
      "https://one.example.com/device?code=1",
    )
  })

  test("normalizeServerUrl strips trailing slash", () => {
    expect(normalizeServerUrl("https://arcana.otnelhq.com/")).toBe("https://arcana.otnelhq.com")
  })
})
