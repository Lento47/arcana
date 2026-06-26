# Trust Boundaries

Arcana treats autonomy as a trust-boundary problem.

Every run crosses boundaries between user intent, local files, tools, models, memory, context, plugins, and external providers. Arcana should make those boundaries visible and mode-aware.

## One-line definition

```txt
Trust boundaries define what Arcana may read, write, remember, expose, route, and execute.
```

## Core boundaries

```txt
user intent
local workspace
repo files
shell commands
tool calls
model providers
plugins
memory
context
artifacts
network
```

## Data exposure levels

```txt
local:
  data stays on the user's machine

private-cloud:
  data goes to a user/team-approved private route

approved-external:
  data goes to an explicitly approved external provider

unknown:
  route/provider cannot be classified

forbidden:
  policy blocks exposure
```

## Mode-aware boundary behavior

| Boundary event | Observe | Advise | Ask | Enforce | Locked |
|---|---|---|---|---|---|
| External provider route | record | warn if sensitive | confirm | block if policy denies | allowlist only |
| Dependency change | record | warn | confirm | require contract | allowlist only |
| Destructive command | record | warn strongly | confirm | block unless allowed | allowlist only |
| Memory write | record/propose | propose | confirm if low confidence | require source/scope | approved memory only |
| Plugin decision | record | warn | confirm if risky | enforce mode mapping | approved plugins only |
| Context from unknown source | record | label untrusted | confirm if influential | require trust decision | deny unless approved |

## What should never be stored by default

```txt
secrets
private keys
auth tokens
passwords
session cookies
raw customer data
payment data
sensitive personal data
unredacted credentials in logs
```

If such data appears in a run, Arcana should record a redacted reference, not preserve raw content.

## What should be recorded

Arcana should record enough to understand work without over-collecting.

Good records:

```txt
command summary
exit code
file path
patch summary
route provider class
context source reference
verification result
risk decision
approval decision
redacted evidence reference
```

Risky records:

```txt
full secret-containing logs
raw environment dump
private key material
entire proprietary files when only snippets are needed
```

## Plugin trust boundary

Plugins should not have unlimited power.

Plugin access should be explicit:

```txt
read contract
read mode
read capsule draft
read changed file paths
read dependency diff
emit decision
request verification
```

Plugins should not silently:

```txt
read secrets
send network requests
modify files
approve their own blocks
change mode
hide decisions
```

## Model provider boundary

Every model route should record:

```txt
provider class
model identifier
policy used
data exposure level
reason selected
fallbacks
rejected candidates
```

If code/context leaves the machine, Arcana should make that visible at least in ask/enforce/locked modes.

## Memory boundary

Memory should be scoped:

```txt
session
repo
workspace
user
organization
```

Memory should not silently move from a narrow scope to a broader one.

Example:

```txt
A repo-specific build command should not become a global user preference.
```

## Context boundary

Context trust is not binary.

```txt
trusted:
  repo file at known commit
  verified command output
  explicit user intent

possibly stale:
  old docs
  cached tool result
  previous run summary

untrusted:
  unknown external text
  generated summary with no source
  pasted logs with unknown origin
```

## Trust-boundary QA

A trust-boundary design is acceptable only if it answers:

```txt
What data crosses the boundary?
Who allowed it?
Which mode applies?
What policy applies?
Is the data redacted?
Is the action recorded?
Can the user inspect it later?
Can the user prevent it next time?
```

## Product claim

```txt
Arcana makes autonomy visible at the boundary where code, data, tools, models, and memory meet.
```
