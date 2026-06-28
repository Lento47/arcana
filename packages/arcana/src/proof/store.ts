// SPDX-License-Identifier: MIT OR LicenseRef-arcana-Commercial
// Copyright (c) 2026 arcana contributors

import path from "node:path"
import { mkdir, writeFile } from "node:fs/promises"
import type { RunProof } from "./types.js"
import { normalizeRunProof } from "./compat.js"

export type ProofStoreTarget = "repo" | "home"

export type StoredRunProof = {
  proof: RunProof
  json_path: string
  markdown_path?: string
}

export function proofDir(input: { cwd?: string; home?: string; target?: ProofStoreTarget } = {}): string {
  const target = input.target ?? "repo"
  const cwd = input.cwd ?? process.cwd()

  if (target === "home") {
    const home = input.home ?? process.env.HOME ?? process.env.USERPROFILE ?? cwd
    return path.join(home, ".arcana", "proofs")
  }

  return path.join(cwd, ".arcana", "proofs")
}

export async function saveRunProof(
  proof: RunProof,
  input: { cwd?: string; target?: ProofStoreTarget; markdown?: string } = {},
): Promise<StoredRunProof> {
  proof = normalizeRunProof(proof)
  const dir = proofDir({ cwd: input.cwd, target: input.target })
  await mkdir(dir, { recursive: true })

  const jsonPath = path.join(dir, `${proof.id}.json`)
  await writeFile(jsonPath, `${JSON.stringify(proof, null, 2)}\n`, "utf8")

  let markdownPath: string | undefined
  if (input.markdown) {
    markdownPath = path.join(dir, `${proof.id}.md`)
    await writeFile(markdownPath, input.markdown.endsWith("\n") ? input.markdown : `${input.markdown}\n`, "utf8")
  }

  return { proof, json_path: jsonPath, markdown_path: markdownPath }
}
