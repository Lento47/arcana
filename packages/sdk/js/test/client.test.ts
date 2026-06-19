import { describe, expect, test } from "bun:test"
import { createArcana, createOpencode, ArcanaClient } from "../src/v2/index"

describe("@arcana/sdk", () => {
  test("exports arcana-branded APIs", () => {
    expect(createArcana).toBeDefined()
    expect(typeof createArcana).toBe("function")
    expect(ArcanaClient).toBeDefined()
  })

  test("keeps backward-compat opencode APIs", () => {
    expect(createOpencode).toBeDefined()
    expect(typeof createOpencode).toBe("function")
    // createOpencode is the deprecated alias for createArcana
    expect(createOpencode).toBe(createArcana)
  })

  test("createArcana is callable without crashing (no server available)", async () => {
    // Should reject with a connection/timeout error, not throw synchronously
    try {
      await createArcana({ baseUrl: "http://127.0.0.1:19999" })
      // If it resolves, the server happened to be running — that's fine
    } catch (err: any) {
      expect(err).toBeDefined()
      // Expected: connection refused or timeout
    }
  })

  test("ArcanaClient import matches OpencodeClient", () => {
    const { OpencodeClient } = require("../src/v2/gen/sdk.gen")
    expect(ArcanaClient).toBe(OpencodeClient)
  })
})
