import { readFileSync } from "node:fs"
import { join } from "node:path"
import { expect, test } from "bun:test"

const sessionSource = readFileSync(
  join(import.meta.dir, "../src/routes/session/index.tsx"),
  "utf8",
)
const promptSource = readFileSync(
  join(import.meta.dir, "../src/component/prompt/index.tsx"),
  "utf8",
)

test("a stale pending-session hydration effect aborts when the route has moved on", () => {
  expect(sessionSource).toContain("if (route.sessionID !== sessionID) return")
})

test("pending stub cleanup happens only after navigating to the real session", () => {
  const remap = promptSource.indexOf("remapOptimisticSession(pendingStubID, createdID)")
  const navigate = promptSource.indexOf("route.navigate({", remap)
  const forget = promptSource.indexOf("sync.session.forget(pendingStubID)", remap)

  expect(remap).toBeGreaterThanOrEqual(0)
  expect(navigate).toBeGreaterThan(remap)
  expect(forget).toBeGreaterThan(navigate)
})

test("session messages reuse a stable transcript order when nothing changed", () => {
  expect(sessionSource).toContain("refreshTranscriptOrder(stored, orderedTranscript)")
  expect(sessionSource).toContain("computeAssistantDurations(list)")
  expect(sessionSource).toContain("sync.session.pruneLoaded(prev)")
  expect(sessionSource).toContain("revisions[message.id]")
})
