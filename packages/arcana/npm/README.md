# arcana-ai

Arcana is a governed autonomy runtime, operator console, and proof system for AI agents. The model proposes; the engine decides; the proof records.

```bash
npx arcana-ai
# or
npm install -g arcana-ai
arcana
```

Arcana combines a terminal operator console with policy enforcement, persistent permissions, skills, memory, gateways, scheduled work, and evidence capture. Sensitive execution is evaluated by the runtime rather than delegated to model discretion.

## Start

Set a supported provider key, then launch the console:

```bash
export OPENAI_API_KEY=sk-...
arcana
```

Use `arcana --help` for non-interactive commands and `arcana doctor` to inspect the local installation.

## Verification

Release builds are gated by Arcana's TypeScript/Rust ACEP-1 conformance suite and ship a machine-readable conformance report. Internal conformance is not presented as an external audit.

- Documentation: https://arcana.otnelhq.com/docs
- Source and reproducibility procedure: https://github.com/Lento47/arcana
- Issues: https://github.com/Lento47/arcana/issues
