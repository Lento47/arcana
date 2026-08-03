# Contributing to arcana

Thanks for contributing. Before submitting a PR, please:

## CLA

All contributors must agree to the [Contributor License Agreement](CLA.md). By submitting a PR, you acknowledge and agree to the CLA.

## Guidelines

- Keep PRs focused — one change per PR
- Write in English
- Follow existing code style (Bun formatting, no semicolons, ESM imports)
- Add a changelog entry for user-facing changes
- Skills: each `SKILL.md` must have valid YAML frontmatter

## Repository authority and scope

Before changing behavior, read:

- `docs/PRODUCT.md` — the product and M1 boundary
- `docs/STATUS.md` — what is currently mounted and verified
- `docs/ROADMAP.md` — what is Now, Next, and Later
- `docs/REPOSITORY-STRUCTURE.md` — package ownership and dependency direction
- `contracts/` — the machine-readable Runtime/Desktop interface

The runtime owns governance authority. CLI, TUI, Desktop, and SDK surfaces consume runtime contracts; they must not create competing approval state machines, policy decisions, proof semantics, or event schemas.

Historical phase reports, sign-offs, and test totals are evidence for their evaluated commit. They do not override the current product definition, status, roadmap, or machine-readable contracts.

## Change scope

Choose one primary category for each PR:

- security boundary
- runtime contract
- product surface
- reliability
- documentation / evidence
- later product track

Do not combine a contract change, security-boundary refactor, UI redesign, broad documentation cleanup, and release work in one PR.

Contract changes must update the machine-readable artifact and implementation together, regenerate or update clients, document compatibility/protocol impact, and add conformance tests.

Security-boundary changes must include negative tests proving denied, stale, expired, revoked, or unauthorized paths execute zero protected effects.

## Development

```sh
bun install
bun run typecheck       # turbo typecheck (16 packages)
bun run lint            # oxlint (warnings only; 0 errors required)
bun run test            # turbo test
bun run ml:eval         # @arcana/ml evaluation fixtures
bun run smoke           # CLI/TUI/ML/web surface sanity check
bun run verify          # lint + typecheck + test + ml:eval + build (full pipeline)
bun run build           # turbo build
```

## Testing patterns

Arcana uses [bun:test](https://bun.sh/docs/cli/test) with two primary patterns:

### Effect-based tests

Use `testEffect(...)` from `test/lib/effect.ts` for tests that exercise Effect services:

```typescript
import { describe, expect } from "bun:test"
import { Effect, Layer } from "effect"
import { testEffect } from "../lib/effect"

const it = testEffect(Layer.mergeAll(MyService.defaultLayer))

describe("my service", () => {
  it.effect("does the thing", () =>
    Effect.gen(function* () {
      const svc = yield* MyService.Service
      const out = yield* svc.run()
      expect(out).toEqual("ok")
    }),
  )
})
```

- `it.effect(...)` — runs with `TestClock` and `TestConsole`
- `it.live(...)` — depends on real time, filesystem, git, or OS behavior
- `it.instance(...)` — live Effect tests that need a scoped temporary directory

### Standard tests

Use `describe`/`test`/`expect` for non-Effect code:

```typescript
import { describe, expect, test } from "bun:test"

describe("utility", () => {
  test("parses correctly", () => {
    expect(parse("input")).toEqual({ ok: true })
  })
})
```

### Test fixtures

The `tmpdir` function creates temporary directories with automatic cleanup:

```typescript
import { tmpdir } from "./fixture/fixture"

test("example", async () => {
  await using tmp = await tmpdir({ git: true })
  // tmp.path is the temp directory
  // automatically cleaned up when test ends
})
```

## Evidence

Record exact commands, totals, platform, and evaluated commit. A previous test result does not validate a later commit.

Do not mark behavior complete solely because types compile or unit tests exist. Release claims require production mounting, restart behavior, failure-path validation, and explicit sign-off where defined.

## PR process

1. Fork the repo and create a focused branch
2. Make one bounded change following the code style and ownership rules
3. Run the most relevant targeted tests, then `bun run verify` when practical
4. Record exact commands and results in the PR template
5. Open a draft PR for security-boundary, contract, or broad structural changes
6. Resolve reviewer concerns before marking ready

## Code style

- **Formatter:** Prettier (`semi: false`, `printWidth: 120`)
- **Linter:** oxlint
- **Module system:** ESM (`import`/`export`)
- **TypeScript:** strict mode with `verbatimModuleSyntax`

## License

Your contributions will be available under the [dual license](LICENSE) (MIT + Commercial).
