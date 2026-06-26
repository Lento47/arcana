# Plugin Permissions

Plugins extend Arcana user space, but they must not become hidden authority.

This document defines a draft permissions model for plugins.

## One-line definition

```txt
Plugin permissions define what a plugin can inspect, suggest, request, or influence.
```

## Permission classes

```txt
read:
  plugin may inspect structured Arcana data

annotate:
  plugin may add warnings, notes, or evidence

recommend:
  plugin may suggest route, verification, or policy changes

request:
  plugin may request confirmation or verification

block-recommendation:
  plugin may recommend blocking, but Arcana mode/policy decides final behavior
```

## Suggested permissions

```txt
contract:read
mode:read
capsule:read-draft
capsule:annotate
route:read
route:score
context:read-metadata
memory:read-metadata
memory:propose
verification:request
dependency:read-diff
dependency:score-risk
risk:emit
```

## Restricted permissions

These should require explicit approval:

```txt
file:read-content
network:access
command:run
artifact:create
memory:activate
policy:read
```

## Forbidden by default

Plugins should not silently:

```txt
read secrets
modify source files
send network requests
approve their own recommendations
change active mode
change active contract
hide decisions from the capsule
execute shell commands
```

## Mode behavior

| Plugin output | Observe | Advise | Ask | Enforce | Locked |
|---|---|---|---|---|---|
| annotation | record | show | show | show | show if approved |
| warning | record | show | show | show | show if approved |
| confirmation request | record | warn | ask | require policy path | require approved path |
| block recommendation | record | warn | ask | block if policy matches | block unless allowlisted |

## Plugin manifest draft

```json
{
  "name": "dependency-intent",
  "version": "0.1.0",
  "permissions": [
    "mode:read",
    "contract:read",
    "dependency:read-diff",
    "risk:emit",
    "capsule:annotate"
  ],
  "hooks": [
    "onDependencyChanged"
  ],
  "network": false,
  "writesFiles": false
}
```

## Permission review checklist

A plugin is acceptable only if it answers:

```txt
What data does it inspect?
What decisions can it emit?
Can it request confirmation?
Can it recommend blocking?
Can it access the network?
Can it read file contents?
Can it write files?
Can it run commands?
How are outputs recorded in the capsule?
How does it fail safely?
```

## Failure behavior

If a plugin fails:

```txt
observe:
  record plugin failure

advise:
  warn and continue

ask:
  ask user if plugin failure affects risk decision

enforce:
  fail closed for required policy plugins, otherwise continue with warning

locked:
  fail closed for approved required plugins
```

## Product claim

```txt
Arcana plugins extend autonomy, but mode and policy remain the source of authority.
```
