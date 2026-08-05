# Adapter Certification Registry (E7 draft)

Certification levels (playbook §34/E7):

| Level | Meaning | Boundary claim |
|---|---|---|
| A3 | Native exact-effect integration | Tool calls flow through the Arcana PEP before the effect; highest fidelity |
| A2 | Sandboxed black-box process | OS-level filesystem/process/network/secret constraints |
| A1 | PTY/process observation | Arcana supervises the process and mediates what is interceptable; explicitly lower fidelity |
| A0 | Telemetry only | No enforcement claim |

Every certification record must state: boundaries covered, known bypasses,
test version, protocol version, and operating systems.

## Registry

| Adapter | Level | Boundaries covered | Known bypasses | Status |
|---|---|---|---|---|
| SDK governed tool hook (AI SDK-style tools) | A3 (scaffold) | Tool-call → canonical AuthorizationRequest; ALLOW-only execution; exact-request binding; framework approval cannot bypass the hook | Requires a real PEP transport (authorize/executeExact callbacks) — no sandbox for the executor | DRAFT (E6) |
| `arcana launch codex` | A1 (certified) | Process supervision (spawn, cwd, exit status, duration); durable launch evidence; workspace identity binding; interceptable surface (argv, cwd, lifecycle, exit code) | No OS-level sandbox; effects outside Arcana supervision are not governed; PTY/terminal-mediated effects are not intercepted | CERTIFIED A1 (2026-08-05) |
| `arcana launch claude` | A0 | Launch scaffold (CLI surface + `--dry-run` declaration); telemetry only — no enforcement claim | All runtime effects are ungoverned (A0) | DRAFT (A0) |
| `arcana launch gemini` | A0 | Launch scaffold (CLI surface + `--dry-run` declaration); telemetry only — no enforcement claim | All runtime effects are ungoverned (A0) | DRAFT (A0) |
| MCP gateway | — | Planned | — | PLANNED |

## Certification records

### `arcana launch codex` — A1 (certified 2026-08-05)

- Protocol version: `1.0-draft`; test version: `e5-a1-1`.
- Operating systems: Windows (validated in-tree). Linux/macOS live validation
  is pending and tracked separately (BLK-D-03 / BLK-CLI-04).
- Evidence:
  - `packages/engine/test/node/launch-declaration.test.ts` pins the declared
    level, evidence, and nonclaims for every runtime.
  - `packages/engine/test/cli/launch.test.ts` runs the real CLI
    (`arcana launch codex --dry-run`) and pins the printed declaration.
  - Engine file-read containment boundary (D-7.1 `SafeBoundedFileReader`):
    hostile-escape fixtures (traversal, absolute path, null byte, directory,
    size budget, junction escape) run green in the core + engine suites. The
    launch path itself performs no agent-driven file reads today, so the
    boundary is documented as available-but-not-in-path; any future
    agent-readable content must route through `readBoundedFile`.
- Nonclaims:
  - No sandbox claim: no OS-level filesystem/network/process/secret
    containment.
  - No exact-effect PEP claim: runtime tool calls do not flow through the
    Arcana PEP before the effect.
  - No file-read containment claim in the launch path.
  - No Linux/macOS runtime validation yet.

### `arcana launch claude` — A0 (declared; no claim)

- Protocol version: `1.0-draft`; test version: `e5-a0-scaffold`.
- Scaffold only: CLI surface + `--dry-run` declaration; no enforcement claim
  and no certification fixtures have been run.
- Nonclaims: no enforcement claim of any kind; no sandbox claim; no exact-effect
  PEP claim.

### `arcana launch gemini` — A0 (declared; no claim)

- Protocol version: `1.0-draft`; test version: `e5-a0-scaffold`.
- Scaffold only: CLI surface + `--dry-run` declaration; no enforcement claim
  and no certification fixtures have been run.
- Nonclaims: no enforcement claim of any kind; no sandbox claim; no exact-effect
  PEP claim.

## Certification procedure

1. Declare level + boundaries + bypasses in this registry.
2. Run the hostile-escape fixture set for the declared boundary; record
   blocked vs unblocked outcomes honestly.
3. Record protocol version (`1.0-draft`), test version, and OS matrix.
4. Independent review (L3+) before any production certification claim.

## Nonclaims

- No adapter may claim a level it has not passed the fixture set for.
- A1 does not equal A2; PTY observation is not kernel containment.
- Processes launched outside the adapter boundary are out of scope.
