import { expect, mock, test } from "bun:test"

import { runCouncil } from "./council.js"

mock.module("./models-dev.js", () => ({
  fetchModelsDev: async () => ({}),
}))

test("records failed council attempts in ProofGate without calling models", async () => {
  const previousProxyKey = process.env.ARCANA_PROXY_KEY
  delete process.env.ARCANA_PROXY_KEY
  const calls: unknown[] = []
  try {
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

    expect(result).toContain("needs at least 2 credentialed models")
    expect(calls).toHaveLength(1)
    const [recorded] = calls as Array<{
      prompt: string
      models: string[]
      rounds: number
      vote_mode: string
      status: string
      errored: string[]
    }>
    expect(recorded).toMatchObject({
      prompt: "compare migration strategies",
      models: [],
      rounds: 1,
      vote_mode: "majority",
      status: "failed",
    })
    expect(recorded?.errored[0]).toBe("council needs at least 2 credentialed models")
  } finally {
    if (previousProxyKey === undefined) delete process.env.ARCANA_PROXY_KEY
    else process.env.ARCANA_PROXY_KEY = previousProxyKey
  }
})
