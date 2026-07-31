import { describe, expect, test } from "bun:test"
import { shouldKeepLocalPart } from "../src/util/part-merge"

const NOW = 1_000_000
const SILENCE_MS = 30_000

const restText = { id: "p1", type: "text", text: "full text from rest" }
const currentText = { id: "p1", type: "text", text: "prefix" }

describe("shouldKeepLocalPart", () => {
  test("untracked part: REST wins", () => {
    expect(
      shouldKeepLocalPart({
        rest: restText,
        current: currentText,
        tracked: false,
        lastEventAt: 0,
        now: NOW,
        silenceMs: SILENCE_MS,
      }),
    ).toBe(false)
  })

  test("no current part: REST wins", () => {
    expect(
      shouldKeepLocalPart({
        rest: restText,
        current: undefined,
        tracked: true,
        lastEventAt: NOW - 1,
        now: NOW,
        silenceMs: SILENCE_MS,
      }),
    ).toBe(false)
  })

  test("tracked part with recent delta: keep local (live stream)", () => {
    expect(
      shouldKeepLocalPart({
        rest: restText,
        current: currentText,
        tracked: true,
        lastEventAt: NOW - 500,
        now: NOW,
        silenceMs: SILENCE_MS,
      }),
    ).toBe(true)
  })

  test("tracked part with delta inside window but stream silent at boundary", () => {
    expect(
      shouldKeepLocalPart({
        rest: restText,
        current: currentText,
        tracked: true,
        lastEventAt: NOW - SILENCE_MS + 1,
        now: NOW,
        silenceMs: SILENCE_MS,
      }),
    ).toBe(true)
  })

  test("tracked part silent past the window: REST wins (stream died)", () => {
    expect(
      shouldKeepLocalPart({
        rest: restText,
        current: currentText,
        tracked: true,
        lastEventAt: NOW - SILENCE_MS - 1,
        now: NOW,
        silenceMs: SILENCE_MS,
      }),
    ).toBe(false)
  })

  test("tracked part never delta'd (tool part): REST wins", () => {
    expect(
      shouldKeepLocalPart({
        rest: { id: "p2", type: "tool" },
        current: { id: "p2", type: "tool" },
        tracked: true,
        lastEventAt: 0,
        now: NOW,
        silenceMs: SILENCE_MS,
      }),
    ).toBe(false)
  })

  test("legacy guard: REST empty text, local accumulated text: keep local", () => {
    expect(
      shouldKeepLocalPart({
        rest: { id: "p1", type: "text", text: "" },
        current: currentText,
        tracked: false,
        lastEventAt: 0,
        now: NOW,
        silenceMs: SILENCE_MS,
      }),
    ).toBe(true)
  })

  test("legacy guard does not fire for non-text parts", () => {
    expect(
      shouldKeepLocalPart({
        rest: { id: "p3", type: "tool" },
        current: { id: "p3", type: "tool" },
        tracked: false,
        lastEventAt: 0,
        now: NOW,
        silenceMs: SILENCE_MS,
      }),
    ).toBe(false)
  })

  test("legacy guard does not fire when REST also has text", () => {
    expect(
      shouldKeepLocalPart({
        rest: restText,
        current: currentText,
        tracked: false,
        lastEventAt: 0,
        now: NOW,
        silenceMs: SILENCE_MS,
      }),
    ).toBe(false)
  })
})
