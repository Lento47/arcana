import { describe, expect, test } from "bun:test"
import { dominantMotionCue, SPINE_MOTION_INTERVAL_MS } from "../src/shell/command-spine/spine-motion"

describe("dominantMotionCue", () => {
  test("uses a calm terminal animation cadence", () => {
    expect(SPINE_MOTION_INTERVAL_MS).toBe(250)
  })

  test("selects the latest streaming thought over tools and composer", () => {
    const cue = dominantMotionCue([
      { id: "thought", kind: "think", streaming: true },
      { id: "read", kind: "inspect", streaming: true },
      { id: "test", kind: "run", streaming: true },
    ], "working")

    expect(cue).toBe("entry:thought")
  })

  test("keeps a live activity summary on the shared liveness cue", () => {
    expect(dominantMotionCue([
      { id: "thought", kind: "think", streaming: true },
      { id: "activity", kind: "think", streaming: true, activity: { type: "work" } },
    ], "working")).toBe("entry:activity")
  })

  test("falls back from thinking to the composer", () => {
    expect(dominantMotionCue([{ id: "thought", kind: "think", streaming: true }], "working"))
      .toBe("entry:thought")
    expect(dominantMotionCue([], "working")).toBe("composer")
    expect(dominantMotionCue([], "idle")).toBeUndefined()
  })

  test("keeps tool rows static and puts working motion in the composer", () => {
    expect(dominantMotionCue([{ id: "test", kind: "run", streaming: true }], "working"))
      .toBe("composer")
  })

  test("ignores static historical rows", () => {
    expect(dominantMotionCue([
      { id: "old-run", kind: "run", streaming: false },
      { id: "old-thought", kind: "think" },
    ], "waiting")).toBeUndefined()
  })
})
