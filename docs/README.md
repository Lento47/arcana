# Arcana documentation map

Arcana documentation is organized by authority and lifecycle. A document must not silently compete with another document that answers the same question.

## Current authorities

| Question | Authority |
|---|---|
| What product are we building? | [`PRODUCT.md`](PRODUCT.md) |
| What is true at the current implementation checkpoint? | [`STATUS.md`](STATUS.md) |
| What should be worked on now, next, and later? | [`ROADMAP.md`](ROADMAP.md) |
| What work items and evidence remain? | [`TASKS.md`](TASKS.md) and [`BLOCKERS.md`](BLOCKERS.md) |
| What must pass before release? | [`FREEZE-RELEASE.md`](FREEZE-RELEASE.md) until a narrower `RELEASE.md` replaces it |
| What is the Runtime/Desktop authority model? | [`design/contract-first-architecture.md`](design/contract-first-architecture.md) |
| What interface must clients consume? | [`../contracts/approval-api.v1.yaml`](../contracts/approval-api.v1.yaml) and [`../contracts/events.v1.json`](../contracts/events.v1.json) |

## Evidence, not authority

Milestone reports, sign-offs, test totals, security evaluations, and historical phase documents are evidence for a particular commit or tag. They do not override current product scope, current status, the active roadmap, or machine-readable contracts.

When a historical document is retained:

- preserve its original claims and evaluated commit;
- label it historical, frozen, superseded, or archived;
- link to the current authority;
- never update it as though it were a living project plan.

## Document classes

Use one of these values in front matter for living or formal documents:

- `product_definition`
- `status`
- `roadmap`
- `architecture`
- `contract`
- `task_register`
- `blocker_register`
- `release_gate`
- `evidence`
- `historical`
- `reference`

## Update rules

1. Implementation changes update `STATUS.md` only when the behavior is mounted and verified.
2. Priority changes update `ROADMAP.md`; they do not rewrite historical phase reports.
3. Contract changes modify the machine-readable artifact and implementation in the same review.
4. Completed work moves from active planning into evidence or history instead of remaining duplicated across several living documents.
5. Generated, vendored, agent-cache, and mirrored documentation must not become a second editable authority.

## Target layout

```text
docs/
├── README.md
├── PRODUCT.md
├── STATUS.md
├── ROADMAP.md
├── RELEASE.md
├── SECURITY.md
├── architecture/
│   ├── current.md
│   └── decisions/
├── evidence/
│   ├── milestones/
│   ├── signoffs/
│   └── test-runs/
└── archive/
    ├── phases/
    ├── superseded-designs/
    └── historical-reports/
```

The migration to this layout should happen incrementally through reviewable pull requests. Do not bulk-delete evidence during the first pass.
