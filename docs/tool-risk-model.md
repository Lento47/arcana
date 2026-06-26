# Tool Risk Model

Arcana should classify tool use by risk class instead of treating all tools equally.

This document is a design guide for future policy work. It does not define runtime enforcement.

## One-line definition

```txt
The Tool Risk Model helps Arcana decide when to record, warn, ask, restrict, or require approval for tool use.
```

## Risk classes

### Read-only

Examples:

```txt
list files
read files
inspect metadata
summarize local state
```

Default behavior:

```txt
observe: record
advise: allow
ask: allow
 enforce: allow if contract permits reads
locked: allow only inside approved scope
```

### Local modification

Examples:

```txt
edit a source file
update documentation
change a config file
```

Default behavior:

```txt
observe: record
advise: warn if broad
ask: confirm if outside scope
enforce: require contract scope
locked: approved scope only
```

### Local verification

Examples:

```txt
run tests
run typecheck
run build check
run local validation
```

Default behavior:

```txt
observe: record
advise: suggest when missing
ask: ask before final unverified status
enforce: required for proven success when contract says so
locked: required when policy says so
```

### External exposure

Examples:

```txt
send context to a provider
use an external service
share an artifact outside local workspace
```

Default behavior:

```txt
observe: record exposure
advise: warn when sensitive
ask: confirm
 enforce: require routing policy
locked: approved route only
```

### Release-sensitive action

Examples:

```txt
change release metadata
prepare release notes
touch release configuration
```

Default behavior:

```txt
observe: record
advise: warn
ask: confirm
 enforce: require release-readiness contract
locked: approved release path only
```

## Mode application

```txt
observe:
  record tool class and result

advise:
  show risk label and continue

ask:
  confirm at risk boundary

enforce:
  require contract/policy allowance

locked:
  approved classes only
```

## Tool event fields

Future tool events should include:

```txt
tool name
tool class
mode
contract
input summary
output summary
risk
policy result
capsule reference
```

## Product claim

```txt
Arcana treats tools as autonomy boundaries, not invisible implementation details.
```
