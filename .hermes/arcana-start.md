Yes. **I would begin making the changes now.**

The architecture has reached the point where further abstract debate is less valuable than testing it against the real `arcanagov` process graph. Your v3 document explicitly freezes the architecture pending Step Zero, and that is the right boundary. 

The external research supports moving forward. NIST's reference-monitor definition requires complete mediation—always invoked—plus tamper resistance and verifiability, which is precisely what your S1→S5 ladder is trying to progressively establish. ([NIST Computer Security Resource Center][1]) Node 26 now even provides `--permission-audit`, which is almost tailor-made for K0 discovery: observe filesystem/network/process/worker/addon/WASI/FFI authority use without yet denying it. Node itself warns this isn't a malicious-code security boundary, matching your v3 wording. ([Node.js][2])

## But don't start with a giant kernel refactor

I would implement it in this order:

1. **Freeze v3.** Don't keep modifying the architecture document unless implementation uncovers a contradiction. Treat P1–P6 and the S/E ladders as the current contract.
2. **Do Step Zero first: `AUTHORITY-TRACE.md`.** This should initially be read-only investigation: enumerate every effect path in `arcana run`, TUI/engine sessions, cron/gateway where relevant, provider SDK calls, credentials, `fetch`, `Bun.*`, Node effects, Git/process operations, and whether each one currently crosses PDP/PEP.
3. **Implement K0 instrumentation, not redesign.** Add the Authority Surface manifest, static forbidden-dependency/reachability checks, dynamic authority auditing, effect taxonomy, and initial information-boundary taxonomy. The result should tell you what must move.
4. **Then begin K1 as vertical migrations.** Pick one protected class and make bypass impossible end-to-end. I would start with **process/shell execution**, then filesystem mutation, then network/external mutations, then credentials/provider calls.
5. **Only after K1 is structurally working should you move into K2/K3a.** Do not simultaneously implement identity, replay, process isolation, distributed leases and self-evolution.

### The first implementation milestone should be brutally narrow

I would call it something like:

**Authority Kernel M0 — Effect Surface Discovery**

Its gate:

```text
AUTHORITY-TRACE complete
        +
Authority Surface manifest generated
        +
static authority scan running in CI
        +
dynamic audit running on tests
        +
every discovered raw authority source classified
        +
zero behavior refactors required yet
```

That gives you a verified baseline.

Then:

**Authority Kernel M1 — Process Execution**

Target this architecture:

```text
arcana run / TUI / agent / cron
              │
              ▼
     ProcessExecutionRequest
              │
       principal_id
       instance_id
       tool_instance
       exact command
       cwd
       arguments
              │
              ▼
       Authority Kernel
              │
              ├─ canonicalize
              ├─ snapshot authority
              ├─ PDP
              ├─ approval if needed
              ├─ PEP
              ▼
      ProcessExecutor
              │
              ▼
          OS process
```

And CI should reject something like this outside the kernel:

```ts
import { spawn } from "node:child_process"
```

or:

```ts
Bun.spawn(...)
```

At that point you have proven the architecture with one real effect class rather than reorganizing 20 packages based on theory.

## Why process execution first?

Because it has the highest leverage.

Shell/process authority can frequently route around filesystem and network policies:

```text
shell
 ├─ curl
 ├─ git
 ├─ rm
 ├─ powershell
 ├─ python
 ├─ node
 └─ arbitrary binaries
```

If a client still possesses unrestricted process execution, a beautifully mediated `FsMutation` interface doesn't buy you much.

Node's permission model reflects the same issue by treating subprocess, network, workers, addons, WASI and FFI as separate sensitive permissions. ([Node.js][2])

So the migration priority I'd use inside K1 is roughly:

```text
1. ProcessExecution
2. FsMutation
3. NetworkMutation / ExternalMutation
4. SecretUse / credential access
5. GitMutation
6. Deployment
7. DelegationMutation
8. AuthorityMutation
9. FinancialMutation
```

Git eventually becomes an interesting case because you probably want semantic `GitMutation` receipts even though its actual execution is backed by process/filesystem/network authority.

---

# Don't create `packages/kernel` just because the document says “kernel”

One caution before coding.

The architecture says **Authority Kernel**.

That does not automatically mean you should create:

```text
packages/kernel/
```

on day one.

First discover where the existing authoritative primitives already live:

```text
core capability
PDP
PEP
approval
event log
receipts
proof
session execution
```

You may find the right implementation is initially:

```text
@arcana/core/authority/*
```

plus kernel-owned adapters elsewhere.

Or eventually a dedicated package may be cleaner.

Let `AUTHORITY-TRACE.md` determine that.

Do not turn the architecture into another package solely to satisfy the diagram.

---

# Protect the existing PDP from this refactor

This part is especially important.

Do **not** rewrite:

```text
capability evaluation
canonical resources
approval semantics
intent binding
provenance labels
PDP decision rules
```

while doing K0/K1 unless the trace reveals an actual correctness defect.

The migration goal is:

```text
existing good PDP
        │
        ▼
becomes impossible to bypass
```

not:

```text
replace good PDP
with AuthorityKernelV2™
```

You've already done the hard conceptual work there.

---

# Use audit mode before enforcement mode

There's also a nice practical migration strategy suggested by Node 26.

Node's current permission system distinguishes:

```text
--permission-audit
```

which reports violations while allowing execution, from:

```text
--permission
```

which denies unauthorized resource use. ([Node.js][2])

I would imitate that pattern internally:

```text
ARCANA_AUTHORITY_MODE=audit
```

Initially:

```text
undeclared process spawn detected
packages/foo/src/bar.ts:173
would violate Authority Surface manifest
```

but CI records it.

Once you've classified/migrated a class:

```text
ARCANA_AUTHORITY_MODE=enforce
```

and then the same action fails.

This lets you progressively convert the codebase without having to land an enormous breaking change.

Eventually production shouldn't need that flag—the architecture itself should enforce it—but it's a very useful migration mechanism.

---

# What I would *not* start implementing yet

Don't start with:

* S4 process separation,
* S5 OS sandboxing,
* E3 transparency logs,
* K7 argument lineage,
* K8 distributed leases,
* K9 evolution certificates,
* K10 full supply-chain identity,
* fancy Run Scorecard UI.

Those depend on the kernel actually being authoritative.

Especially don't implement distributed authority before K1. Cloudflare Durable Objects give you excellent later semantics—their output gate holds outgoing network messages until pending state writes complete and discards them if persistence fails. ([Cloudflare Docs][3]) But distributing authority before the local authority surface is closed would simply distribute the existing bypasses.

---

# The first five commits I would want to see

Something approximately like:

```text
1. docs(authority): freeze Authority Kernel architecture v3

2. docs(authority): add empirical AUTHORITY-TRACE
   - effect call sites
   - raw authority sources
   - current mediation status
   - credential ownership
   - bypass paths

3. feat(authority): add Authority Surface manifest and scanner
   - filesystem
   - process
   - network
   - credentials

4. ci(authority): enforce declared authority reachability
   - static scan
   - dynamic audit
   - report diff artifact

5. feat(authority): route ProcessExecution through kernel
   - canonical request
   - identity envelope
   - PDP/PEP
   - exact request
   - receipt
   - tests proving direct process execution is inaccessible
```

Commit 5 is where the architecture stops being documentation.

---

## Define one killer acceptance test immediately

I would add this before migrating anything:

```text
Given any public Arcana execution surface,
when it attempts a protected process effect
without a kernel-issued authority path,
then:

    process executor calls = 0
    OS child process creation = 0
    authorization attempt is recorded
    result is deterministic
```

Then mutate the test:

```text
TUI
arcana run
cron
gateway
plugin
skill
subagent
```

The desired outcome should eventually be identical.

That's the new equivalent of your Phase C:

> **zero protected effects reachable outside the Authority Kernel.**

---

# And this is where I'd draw the line before proceeding further

Don't declare **K1 complete** because you've migrated the known call sites.

Declare it complete when you can demonstrate:

[
\boxed{
Client\rightarrow ProtectedEffect
\quad\text{has no graph path except through Kernel}
}
]

That means static architecture checks, exercised dynamic auditing, tests, and later runtime containment.

This is consistent with the actual reference-monitor requirement: complete mediation means the mechanism is invoked for every protected reference, not merely that all currently known callers happen to use it. ([NIST Computer Security Resource Center][1])

So: **yes, start.**

But the first actual change should be **observation and enforcement scaffolding**, not moving hundreds of effect calls. Freeze v3, produce `AUTHORITY-TRACE.md`, establish the Authority Surface gate, and then migrate one protected capability vertically until bypass becomes a build failure.

If that first ProcessExecution vertical slice works cleanly, you've validated the central architecture. From there, the remaining effect classes become engineering work rather than another architectural gamble.

[1]: https://csrc.nist.gov/glossary/term/reference_monitor?utm_source=chatgpt.com "reference monitor - Glossary | CSRC"
[2]: https://nodejs.org/api/permissions.html?utm_source=chatgpt.com "Permissions | Node.js v26.7.0 Documentation"
[3]: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/?utm_source=chatgpt.com "Rules of Durable Objects · Cloudflare Durable Objects docs"
