# Windows Services: Lifecycle, Crash Behavior, and Recovery

Deep guide to the Windows Service Control Manager (SCM) model. Raw reference pages: `windows-services-overview.md`, `windows-service-control-manager.md`, `windows-service-status-transitions.md`, `windows-service-failure-actions.md`.

## The SCM model

A Windows service is an executable registered with the SCM, which acts as the single source of truth for service state. The SCM, not the service, owns the state machine; the service reports transitions via `SetServiceStatus` with a fully initialized `SERVICE_STATUS` structure. Nothing else (including `services.msc`, `sc query`, PowerShell, or the system) can observe the service's state except through the SCM.

Key properties:

- A service name is unique per machine. Two services cannot share a name, which makes the SCM the natural single-instance mechanism.
- A service runs in session 0 (no interactive desktop) unless configured otherwise. UI is not possible; communication is via named pipes, TCP, or the SCM's `SERVICE_CONTROL_*` messages.
- Services are started by the SCM (`StartService`) and stopped by it (`ControlService` with `SERVICE_CONTROL_STOP`). The service must call `StartServiceCtrlDispatcher` in its entry point to register its control handler.

## Service states (SERVICE_STATUS.dwCurrentState)

The canonical lifecycle (see `windows-service-status-transitions.md`):

```
STOPPED -> START_PENDING -> RUNNING -> STOP_PENDING -> STOPPED
```

- `SERVICE_STOPPED`: not running. The initial state.
- `SERVICE_START_PENDING`: starting. The SCM gives the service a startup window (roughly 30 s for auto-start services, 125 s for manual/on-demand). Exceeding it marks the start as failed.
- `SERVICE_RUNNING`: ready. This is the readiness signal: dependents and `sc query` treat RUNNING as "up".
- `SERVICE_STOP_PENDING`: stopping. Same watchdog idea: if the service does not reach STOPPED within the stop window (about 125 s), the SCM can force-terminate the process.
- `SERVICE_PAUSE_PENDING` / `SERVICE_PAUSED` / `SERVICE_CONTINUE_PENDING` exist for services that support pause/continue (rare for modern services; mark them in `dwControlsAccepted` only if implemented).

`dwControlsAccepted` advertises which control codes the service handles: `SERVICE_ACCEPT_STOP`, `SERVICE_ACCEPT_SHUTDOWN`, `SERVICE_ACCEPT_PAUSE_CONTINUE`, `SERVICE_ACCEPT_PRESHUTDOWN`, `SERVICE_ACCEPT_PARAMCHANGE`, `SERVICE_ACCEPT_SESSIONCHANGE`, `SERVICE_ACCEPT_TIMECHANGE`, `SERVICE_ACCEPT_TRIGGEREVENT`. If STOP is not accepted, `ControlService` fails and the service cannot be stopped through the SCM.

Checkpoint/progress: during PENDING states, the service reports `dwCheckPoint` (increments) and `dwWaitHint` (ms until next checkpoint). A stalled PENDING state with no checkpoints triggers the watchdog.

## Crash behavior

- If the service process exits for any reason without reporting STOPPED, the SCM records the state as STOPPED and, by default, does nothing else. The service is simply dead. Event Log entries:
  - Event ID 7031: "The X service terminated unexpectedly" (includes the exit code and failure action summary).
  - Event ID 7034: "The X service terminated unexpectedly" (older/plain variant).
- No auto-restart unless failure actions are configured (below).
- Exit code 0 is treated as a clean stop even if the service never called `SetServiceStatus(STOPPED)`? No: an exit without STOPPED reporting is always "unexpected termination" from the SCM's perspective; the failure-action engine decides whether to treat it as a failure. The nuance is in the "Enable actions for stops with errors" flag.

## Recovery: failure actions

Configured via `ChangeServiceConfig2(..., SERVICE_CONFIG_FAILURE_ACTIONS)` (see `windows-service-failure-actions.md`), or the Services.msc Recovery tab, or `sc failure`:

```
sc failure MySvc reset= 86400 actions= restart/5000/restart/10000/reboot/60000
```

Semantics:

- Up to 3 actions, applied in order: first failure -> action[0], second -> action[1], third and every subsequent failure -> action[2] (the last action repeats forever) until the reset period passes.
- Action types: `SC_ACTION_NONE` (do nothing, service stays down), `SC_ACTION_RESTART` (restart the service), `SC_ACTION_REBOOT` (reboot the machine, primarily for boot-critical services), `SC_ACTION_RUN_COMMAND` (run an arbitrary command; the escape hatch for custom supervisors or alerting).
- `Delay` per action in milliseconds. A 0 ms delay restarts in a tight loop, so always set a delay (5-15 s is the common range for crash loops).
- `dwResetPeriod` in seconds: if the service stays up for the full reset period without a failure, the failure count returns to zero and actions restart from action[0]. Default 0 means the count never resets.
- The "Enable actions for stops with errors" option (Recovery tab) makes a non-clean stop (a stop triggered while the service is in an error state) count as a failure too. Without it, only unexpected termination counts.

### The Windows crash-loop problem

SCM has no burst limit. A service configured with a single `SC_ACTION_RESTART` action at 0-1000 ms delay will be restarted every delay forever, even if it dies instantly every time. Consequences:

1. Always configure at least two actions: `restart/delay` then `restart/longer-delay`, or `restart/delay` then `none`, or `restart/delay` then `reboot` for boot-critical services.
2. The repeating-last-action rule means a 3-action list is the max policy surface; the third action is the steady-state behavior.
3. Consider `SC_ACTION_RUN_COMMAND` as the terminal action pointing at a script that health-checks and decides (the poor man's burst limit).

## Startup and dependencies

- Start types: `SERVICE_AUTO_START` (at boot), `SERVICE_DELAYED_AUTO_START` (after other auto-start services, 2 min group, reduces boot contention), `SERVICE_DEMAND_START` (manual), `SERVICE_DISABLED`.
- Dependencies (`SERVICE_DEPENDENCY` list) define start ordering; SCM starts a service only after its dependencies report RUNNING.
- Service trigger events (`SERVICE_TRIGGER_INFO`) can start a service on events (device arrival, firewall port open, custom ETW) — the Windows analogue of socket activation.
- Service accounts: LocalSystem (full, network credentials as machine), NetworkService (network access as machine, no local admin), LocalService (least privilege, network as anonymous), or a dedicated account / gMSA. Least privilege: LocalService or gMSA, never LocalSystem unless required.

## Stopping

- The SCM sends `SERVICE_CONTROL_STOP`; the service handler sets STOP_PENDING, drains, reports STOPPED, and the dispatcher returns. The stop watchdog (~125 s) force-kills the process if it stalls.
- `SERVICE_ACCEPT_SHUTDOWN` gives a shutdown notice (system shutdown drains services in reverse dependency order).
- For a service that hangs on stop: the SCM's pending watchdog is the only enforcement; a hung service blocks shutdown. Prefer fast drain over long cleanup.

## Practical ops

```bat
:: query
sc query MySvc
sc qc MySvc
sc qfailure MySvc

:: control
sc start MySvc
sc stop MySvc
sc config MySvc start= delayed-auto
sc failure MySvc reset= 86400 actions= restart/5000/restart/15000/none

:: PowerShell
Get-Service MySvc
Set-Service MySvc -StartupType Automatic
Restart-Service MySvc
```

## Running non-service programs as services

The SCM requires a service executable (dispatcher + control handler). For arbitrary processes (Node/Bun daemons, scripts):

- NSSM (Non-Sucking Service Manager): wraps any command as a service, adds app restart on crash, stdout/stderr redirection to files, environment, and automatic service recovery wiring. The pragmatic choice for a Bun daemon on Windows.
- WinSW: XML-configured wrapper, commonly used in CI/CD (Jenkins agents).
- Write a minimal service host in-process (Rust/Node native addon / C++): overkill unless the process must accept SCM control messages directly.
- Alternative for non-service workloads: Task Scheduler with "Run whether user is logged on or not" + restart-on-failure settings (less supervision, no crash-loop protection).

## Checklist for a Windows service daemon

1. Register with `StartServiceCtrlDispatcher` and report every state transition accurately (a service that lies about RUNNING breaks dependents and the failure-action engine).
2. Accept STOP (and SHUTDOWN) and drain quickly; never block in the control handler.
3. Configure failure actions with delays and a terminal action; verify `sc qfailure`.
4. Use LocalService or a gMSA, not LocalSystem.
5. Log to the Event Log (or a file via NSSM) so Event ID 7031/7034 has context.
6. If a hang watchdog is required, run an external health checker that restarts via SCM (the SCM has no run-state watchdog).
