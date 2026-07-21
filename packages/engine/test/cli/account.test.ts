import { describe, expect, test } from "bun:test"
import stripAnsi from "strip-ansi"

import {
  ARCANA_CONSOLE_DEFAULT,
  formatAccountLabel,
  formatLoginBanner,
  formatLoginSteps,
  formatLoginSuccess,
  formatOrgLine,
  getDefaultConsoleUrl,
} from "../../src/cli/cmd/account"

describe("console account display", () => {
  test("uses Arcana console as the default login URL (not OpenCode)", () => {
    expect(ARCANA_CONSOLE_DEFAULT).toBe("https://arcana.otnelhq.com")
    expect(ARCANA_CONSOLE_DEFAULT).not.toContain("opencode.ai")
    const prev = process.env.ARCANA_CONSOLE_URL
    delete process.env.ARCANA_CONSOLE_URL
    expect(getDefaultConsoleUrl()).toBe(ARCANA_CONSOLE_DEFAULT)
    process.env.ARCANA_CONSOLE_URL = "https://console.example.test"
    expect(getDefaultConsoleUrl()).toBe("https://console.example.test")
    if (prev === undefined) delete process.env.ARCANA_CONSOLE_URL
    else process.env.ARCANA_CONSOLE_URL = prev
  })

  test("includes the account url in account labels", () => {
    expect(stripAnsi(formatAccountLabel({ email: "one@example.com", url: "https://one.example.com" }, false))).toBe(
      "one@example.com https://one.example.com",
    )
  })

  test("includes the active marker in account labels", () => {
    expect(stripAnsi(formatAccountLabel({ email: "one@example.com", url: "https://one.example.com" }, true))).toBe(
      "one@example.com https://one.example.com (active)",
    )
  })

  test("includes the account url in org rows", () => {
    expect(
      stripAnsi(
        formatOrgLine({ email: "one@example.com", url: "https://one.example.com" }, { id: "org-1", name: "One" }, true),
      ),
    ).toBe("  ● One  one@example.com  https://one.example.com  org-1")
  })

  test("login ceremony has Arcana voice, seal card, and a single verification URL", () => {
    const banner = formatLoginBanner().map((l) => stripAnsi(l)).join("\n")
    expect(banner).toContain("ARCANA")
    expect(banner).toContain("open the seal")
    // No clack intro tree
    expect(banner).not.toMatch(/^\s*T\s/m)
    expect(banner).not.toContain("Log in")

    const url = "https://arcana.otnelhq.com/auth/device?code=ABCD-1234"
    const steps = formatLoginSteps({ url, code: "ABCD-1234" }).map((l) => stripAnsi(l)).join("\n")
    expect(steps).toContain(url)
    expect(steps).not.toContain("otnelhq.comhttps")
    expect(steps).toContain("ABCD-1234")
    expect(steps).toContain("seal")
    expect(steps).toContain("gate")
    expect(steps).toContain("┌")
    expect(steps).toContain("└")
    expect(steps).not.toMatch(/\|\s*$/m) // no clack vertical rail alone

    const success = formatLoginSuccess("adept@example.com").map((l) => stripAnsi(l)).join("\n")
    expect(success).toContain("bound")
    expect(success).toContain("adept@example.com")
    expect(success).toContain("seal holds")
  })
})
