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

## PR process

1. Fork the repo and create a feature branch
2. Make your changes following the code style
3. Run `bun run verify` to ensure all checks pass
4. Write clear commit messages
5. Open a PR with a description of what changed and why

## Code style

- **Formatter:** Prettier (`semi: false`, `printWidth: 120`)
- **Linter:** oxlint
- **Module system:** ESM (`import`/`export`)
- **TypeScript:** strict mode with `verbatimModuleSyntax`

## License

Your contributions will be available under the [dual license](LICENSE) (MIT + Commercial).
