import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { redactGitEmails, redactPII, redactGitAuthorNames } from "./guard.js"
import { gitAddArgs, gitCommitArgs, gitDiffArgs, resolveSandboxScriptPath } from "./tools.js"

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

describe("git PII redaction (redactGitEmails)", () => {
  test("redacts personal email in git log output", () => {
    const input = `lento47 <lejzerv@gmail.com> - prompt fix [bump]`
    expect(redactGitEmails(input)).toBe(`lento47 <REDACTED> - prompt fix [bump]`)
  })

  test("redacts multiple emails in git blame output", () => {
    const input = `abc1234 (User One <user1@personal.com> 2026-07-20) some code`
    expect(redactGitEmails(input)).toBe(`abc1234 (User One <REDACTED> 2026-07-20) some code`)
  })

  test("redacts email in git show Author line", () => {
    const input = `Author: Developer <dev@example.com>`
    expect(redactGitEmails(input)).toBe(`Author: Developer <REDACTED>`)
  })

  test("preserves GitHub noreply email (already private)", () => {
    const input = `lento47 <lento47@users.noreply.github.com> - fix: update docs`
    expect(redactGitEmails(input)).toBe(input)
  })

  test("preserves bot email", () => {
    const input = `github-actions[bot] <github-actions[bot]@users.noreply.github.com> - release: bump`
    expect(redactGitEmails(input)).toBe(input)
  })

  test("preserves text without email addresses", () => {
    const input = `abc1234 fix: update docs\n 1 file changed, 10 insertions(+), 2 deletions(-)`
    expect(redactGitEmails(input)).toBe(input)
  })

  test("redacts multiple personal emails on one line", () => {
    const input = `user-a <a@personal.com>, user-b <b@personal.com>`
    expect(redactGitEmails(input)).toBe(`user-a <REDACTED>, user-b <REDACTED>`)
  })

  test("does not affect non-git URLs", () => {
    const input = `Visit https://example.com for more info`
    expect(redactGitEmails(input)).toBe(input)
  })
})

describe("general PII redaction (redactPII)", () => {
  test("redacts IPv4 addresses", () => {
    const input = `Server at 192.168.1.100 responded OK`
    expect(redactPII(input)).toBe(`Server at <IP_REDACTED> responded OK`)
  })

  test("redacts multiple IPv4 addresses", () => {
    const input = `From 10.0.0.1 to 10.0.0.2 via 172.16.0.1`
    expect(redactPII(input)).toBe(`From <IP_REDACTED> to <IP_REDACTED> via <IP_REDACTED>`)
  })

  test("redacts IPv6 addresses", () => {
    const input = `Host fe80::1 is reachable`
    expect(redactPII(input)).toBe(`Host <IP_REDACTED> is reachable`)
  })

  test("redacts US phone numbers with dashes", () => {
    const input = `Call 555-123-4567 for info`
    expect(redactPII(input)).toBe(`Call <PHONE_REDACTED> for info`)
  })

  test("redacts US phone numbers with parens", () => {
    const input = `Call (555) 123-4567 for info`
    expect(redactPII(input)).toBe(`Call <PHONE_REDACTED> for info`)
  })

  test("redacts street addresses", () => {
    const input = `Located at 123 Main Street near the park`
    expect(redactPII(input)).toBe(`Located at <ADDRESS_REDACTED> near the park`)
  })

  test("redacts multiple PII types in one string", () => {
    const input = `User at 10.0.0.1 called 555-123-4567 from 456 Oak Avenue`
    expect(redactPII(input)).toBe(`User at <IP_REDACTED> called <PHONE_REDACTED> from <ADDRESS_REDACTED>`)
  })

  test("does not affect non-PII text", () => {
    const input = `npm install completed successfully in 3 files`
    expect(redactPII(input)).toBe(input)
  })

  test("does NOT redact bare 10-digit numbers (false positive guard)", () => {
    const input = `Build number 1234567890 completed`
    expect(redactPII(input)).toBe(input)
  })

  test("does NOT redact version strings like 1.2.3.4567890", () => {
    const input = `Using version 1.0.28901234`
    expect(redactPII(input)).toBe(input)
  })

  test("does NOT redact street-like text without suffix", () => {
    const input = `3 files changed, 42 items found`
    expect(redactPII(input)).toBe(input)
  })

  test("does NOT redact 10-digit numbers without formatting", () => {
    const input = `Order number 5551234567 was processed`
    expect(redactPII(input)).toBe(input)
  })

  test("redacts phone with +1 prefix", () => {
    const input = `Call +1-555-123-4567 for support`
    expect(redactPII(input)).toBe(`Call <PHONE_REDACTED> for support`)
  })

  test("redacts phone with dots separator", () => {
    const input = `Fax: 555.123.4567`
    expect(redactPII(input)).toBe(`Fax: <PHONE_REDACTED>`)
  })
})

describe("git author name redaction (redactGitAuthorNames)", () => {
  test("redacts name in Author line", () => {
    const input = `Author: John Doe <john@example.com>`
    expect(redactGitAuthorNames(input)).toBe(`Author: <NAME_REDACTED> <john@example.com>`)
  })

  test("redacts name in Committer line", () => {
    const input = `Committer: Jane Smith <jane@example.com>`
    expect(redactGitAuthorNames(input)).toBe(`Committer: <NAME_REDACTED> <jane@example.com>`)
  })

  test("redacts name in git blame output", () => {
    const input = `abc1234 (John Doe 2026-07-20) some code`
    expect(redactGitAuthorNames(input)).toBe(`abc1234 (<NAME_REDACTED> 2026-07-20) some code`)
  })

  test("preserves system accounts (GitHub)", () => {
    const input = `Author: GitHub <noreply@github.com>`
    expect(redactGitAuthorNames(input)).toBe(input)
  })

  test("preserves dependabot accounts", () => {
    const input = `Author: dependabot[bot] <dependabot@users.noreply.github.com>`
    expect(redactGitAuthorNames(input)).toBe(input)
  })

  test("does not affect non-git text", () => {
    const input = `This is normal text with no author metadata`
    expect(redactGitAuthorNames(input)).toBe(input)
  })
})

describe("env_write sandbox path (ARC-SEC-I05)", () => {
  const root = join("/tmp", "arcana-sandbox-test")

  test("accepts a plain basename", () => {
    const p = resolveSandboxScriptPath(root, "analyze.py")
    expect(p.endsWith("analyze.py")).toBe(true)
    expect(p.includes("..")).toBe(false)
  })

  test("strips directory components and keeps basename only", () => {
    const p = resolveSandboxScriptPath(root, "nested/evil.py")
    expect(p.endsWith("evil.py")).toBe(true)
    expect(p.includes("nested")).toBe(false)
  })

  test("rejects absolute paths", () => {
    expect(() => resolveSandboxScriptPath(root, "/etc/passwd")).toThrow(/absolute/)
    expect(() => resolveSandboxScriptPath(root, "C:\\Windows\\system.ini")).toThrow(/absolute/)
  })

  test("rejects parent traversal", () => {
    expect(() => resolveSandboxScriptPath(root, "../escape.py")).toThrow(/traversal/)
    expect(() => resolveSandboxScriptPath(root, "foo/../../escape.py")).toThrow(/traversal/)
  })

  test("rejects empty and null-byte names", () => {
    expect(() => resolveSandboxScriptPath(root, "")).toThrow(/required/)
    expect(() => resolveSandboxScriptPath(root, "x\0y.py")).toThrow(/invalid/)
  })
})