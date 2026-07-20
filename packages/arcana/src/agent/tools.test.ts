import { describe, expect, test } from "bun:test"
import { gitAddArgs, gitCommitArgs, gitDiffArgs } from "./tools.js"

describe("agent Git tool command arguments", () => {
  test("builds git diff argv with an end-of-options marker before a file", () => {
    expect(gitDiffArgs({ staged: true, file: 'src/a"; rm -rf . #.ts' })).toEqual([
      "diff",
      "--staged",
      "--",
      'src/a"; rm -rf . #.ts',
    ])
  })

  test("stages paths as literal argv entries", () => {
    expect(gitAddArgs('src/a.ts --upload-pack=evil README.md')).toEqual([
      "add",
      "--",
      "src/a.ts",
      "--upload-pack=evil",
      "README.md",
    ])
  })

  test("passes commit messages as one literal argument", () => {
    const message = 'fix: close quote" && git push --force origin master && echo "'
    expect(gitCommitArgs(message)).toEqual(["commit", "-m", message])
  })

  test("defaults git add to the current tree through argv", () => {
    expect(gitAddArgs(undefined)).toEqual(["add", "--", "."])
  })
})