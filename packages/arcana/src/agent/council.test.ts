import { expect, test } from "bun:test"

import { runCouncil } from "./council.js"

test("records failed council attempts in ProofGate without calling models", async () => {
  const calls: unknown[] = []
  const result = await runCouncil(
    {
      prompt: "compare migration strategies",
      models: ["arcana/architect"],
    },
    {
      config: {
        godlike: true,
        proofGate: {
          recordConsensus: async (input: unknown) => {
            calls.push(input)
          },
        },
      },
    } as never,
  )

  expect(result).toContain("needs at least 2 models")
  expect(calls).toEqual([
    {
      prompt: "compare migration strategies",
      models: ["arcana/architect"],
      rounds: 1,
      vote_mode: "majority",
      status: "failed",
      errored: ["council needs at least 2 models"],
    },
  ])
})
