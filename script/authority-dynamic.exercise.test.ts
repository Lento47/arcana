// script/authority-dynamic.exercise.test.ts
// Deterministic offline exercise of the wrapped authority surfaces.
// Calls are EXPECTED to fail or no-op — the assertion is that each attempt was
// RECORDED by the preload, proving the audit harness sees every class.

describe("authority dynamic audit harness", () => {
  it("preserves the fetch static API", () => {
    expect(typeof fetch.preconnect).toBe("function")
  })

  it("records network egress attempts", async () => {
    await fetch("http://127.0.0.1:9/authority-audit-probe", {
      signal: AbortSignal.timeout(250),
    }).catch(() => {}) // unreachable port — recording is the point, not success
  })

  it("records process spawn", () => {
      Bun.spawnSync({
        cmd: [process.execPath, "-e", "process.exit(0)"],
        stdout: "ignore",
        stderr: "ignore",
      })
  })
})
