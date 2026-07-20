import { expect, test } from "bun:test"
import { formatAccountSnapshot, type AccountSnapshot } from "./proxy-client.js"

test("formatAccountSnapshot licensed", () => {
  const snap: AccountSnapshot = {
    licensed: true,
    userId: "enterprise",
    tier: "enterprise",
    credits: 0,
    dollars: "0.00",
    proxyBase: "https://arcana-proxy.lejzerv.workers.dev",
    usage: { requests: 3, limit: 2000 },
  }
  const text = formatAccountSnapshot(snap)
  expect(text).toContain("enterprise")
  expect(text).toContain("Credits: 0")
  expect(text).toContain("$0.00")
  expect(text).toContain("Usage today: 3 / 2000")
})

test("formatAccountSnapshot unlicensed", () => {
  const text = formatAccountSnapshot({ licensed: false, error: "No proxy key" })
  expect(text).toContain("not licensed")
  expect(text).toContain("console login")
})
