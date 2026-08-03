# docs/design — architecture and design documents

Design documents in this directory are binding or reference architecture
material for the Arcana runtime, SDK, TUI, and Desktop surfaces.

## Index

- [`contract-first-architecture.md`](contract-first-architecture.md) —
  **BINDING DESIGN.** One durable log, three projections; the Runtime owns
  all authority; clients (Desktop, SDK) render projections and submit
  commands. Last updated 2026-08-02.

## Rules

- Design docs state their status (`BINDING DESIGN`, `proposal`, `reference`)
  in front matter or the first lines. Only the owning authority may change a
  binding design.
- When a design is superseded, move it to `docs/archive/` and link the
  replacement here — do not leave two live designs answering the same
  question.
- Machine-readable contracts (`../contracts/`) override prose architecture
  where they disagree.
