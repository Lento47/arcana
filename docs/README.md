# Arcana documentation

## Public user docs

The product reference for install, device login, CLI commands, and proxy APIs lives on the site:

**https://arcana.otnelhq.com/docs**

Source for that page: [Lento47/arcana-site](https://github.com/Lento47/arcana-site) (`public/docs/`).

## In-repo docs (this tree)

| Doc | Audience |
|-----|----------|
| [../README.md](../README.md) | Install, quick start, packages overview |
| [security-posture-2026-07-20.md](./security-posture-2026-07-20.md) | Security audit remediation status (I01–I08) |
| [independent-security-audit-2026-07-14.md](./independent-security-audit-2026-07-14.md) | Full independent security audit |
| [architecture/command-spine-ui.md](./architecture/command-spine-ui.md) | Command Spine TUI design |
| [adr/0002-tool-batch-scheduler.md](./adr/0002-tool-batch-scheduler.md) | Tool batch scheduler ADR |
| [agent-operating-layer-index.md](./agent-operating-layer-index.md) | Agent operating layer index |
| [free-usage-weekly-session-plan.md](./free-usage-weekly-session-plan.md) | Free-tier usage plan |

Architecture and design notes under `docs/architecture/` and ADRs under `docs/adr/` are for contributors and maintainers. End users should start at the **public docs** link above.

## Console & proxy (short)

```sh
# Pair CLI with Arcana account (device flow)
arcana console login          # default: https://arcana.otnelhq.com

# Trust this repo for project plugins / tools / local MCP
arcana trust

# Hosted proxy (after login)
# Base: https://proxy.arcana.otnelhq.com
# Auth: Authorization: Bearer <license_key>
```

See the public docs for full device-flow sequence and API tables.
