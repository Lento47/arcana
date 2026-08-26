import { describe, expect, test } from "bun:test"
import { parseGantt, parseSpan, parseClock, parseStatus, statusTone } from "../src/shell/command-spine/widgets/parse"

describe("parseClock", () => {
  test("parses HH:MM to minutes", () => {
    expect(parseClock("00:00")).toBe(0)
    expect(parseClock("09:10")).toBe(550)
    expect(parseClock("23:59")).toBe(1439)
  })

  test("rejects invalid clocks", () => {
    expect(parseClock("24:00")).toBe(-1)
    expect(parseClock("12:60")).toBe(-1)
    expect(parseClock("abc")).toBe(-1)
    expect(parseClock("9:")).toBe(-1)
  })
})

describe("parseSpan", () => {
  test("parses h/m/d spans", () => {
    expect(parseSpan("8h")).toBe(480)
    expect(parseSpan("30m")).toBe(30)
    expect(parseSpan("2d")).toBe(2880)
    expect(parseSpan("2D")).toBe(2880)
  })

  test("rejects invalid spans", () => {
    expect(parseSpan("0h")).toBe(-1)
    expect(parseSpan("h")).toBe(-1)
    expect(parseSpan("-4h")).toBe(-1)
    expect(parseSpan("8x")).toBe(-1)
  })
})

describe("parseGantt", () => {
  test("parses window and full rows", () => {
    const src = [
      "window 09:00 8h",
      "S1 api-gw-5xx 09:10 -> open mit=10:05 sla",
      "S2 repl-lag 07:32 -> 11:30",
      "sev3 webhooks 13:20 -> 15:05 mit=14:10",
    ].join("\n")

    const parsed = parseGantt(src)
    expect(parsed.window).toEqual({ startMin: 540, spanMin: 480 })
    expect(parsed.badLines).toEqual([])
    expect(parsed.rows).toHaveLength(3)

    const [r1, r2, r3] = parsed.rows
    expect(r1!.sev).toBe(1)
    expect(r1!.label).toBe("api-gw-5xx")
    expect(r1!.startMin).toBe(550)
    expect(r1!.endMin).toBeNull()
    expect(r1!.mitMin).toBe(605)
    expect(r1!.sla).toBe(true)

    expect(r2!.sev).toBe(2)
    expect(r2!.endMin).toBe(690)
    expect(r2!.mitMin).toBeNull()

    expect(r3!.sev).toBe(3)
    expect(r3!.mitMin).toBe(850)
  })

  test("defaults severity to S3 when tag missing", () => {
    const parsed = parseGantt("job 08:00 -> 09:00")
    expect(parsed.rows[0]!.sev).toBe(3)
    expect(parsed.rows[0]!.label).toBe("job")
  })

  test("collects malformed lines without throwing", () => {
    const parsed = parseGantt(["window bad", "no arrow here", "S1 x 25:99 -> open", ""].join("\n"))
    expect(parsed.rows).toHaveLength(0)
    expect(parsed.badLines).toHaveLength(3)
  })

  test("ignores comments and blanks", () => {
    const parsed = parseGantt("# header\n\nS2 a 01:00 -> 02:00\n")
    expect(parsed.badLines).toHaveLength(0)
    expect(parsed.rows).toHaveLength(1)
  })

  test("partial stream (unclosed fence body) still parses complete lines", () => {
    const parsed = parseGantt("window 00:00 24h\nS1 inc 09:00 -> ")
    expect(parsed.window).toEqual({ startMin: 0, spanMin: 1440 })
    expect(parsed.rows).toHaveLength(0)
    expect(parsed.badLines).toHaveLength(1)
  })
})

describe("statusTone", () => {
  test("classifies value words", () => {
    expect(statusTone("ok")).toBe("ok")
    expect(statusTone("degraded")).toBe("warn")
    expect(statusTone("FAIL")).toBe("crit")
    expect(statusTone("42")).toBe("neutral")
  })
})

describe("parseStatus", () => {
  test("parses key:value pairs with inferred tones", () => {
    const items = parseStatus("uptime: ok\nlatency: degraded\ncache: 91%")
    expect(items).toEqual([
      { key: "uptime", value: "ok", tone: "ok" },
      { key: "latency", value: "degraded", tone: "warn" },
      { key: "cache", value: "91%", tone: "neutral" },
    ])
  })

  test("explicit trailing tone token wins", () => {
    const items = parseStatus("queue depth: 120 warn")
    expect(items[0]).toEqual({ key: "queue depth", value: "120", tone: "warn" })
  })

  test("skips blank, comment, and colonless lines", () => {
    expect(parseStatus("# note\nno separator\n\nkey: value")).toHaveLength(1)
  })
})
