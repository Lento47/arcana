# Daemon Documentation

Reference library for daemon processes, process lifecycle, and service supervision, all OSes.

## Reference pages (downloaded)

| File | Topic | Source |
|------|-------|--------|
| `daemon.7.md` | Writing and packaging system daemons: daemonize steps, activation, data placement | man7.org daemon(7) |
| `fork.2.md` | fork(2): process creation, the foundation of daemonization | man7.org fork(2) |
| `signal.7.md` | Signal semantics: dispositions, termination, async-signal safety | man7.org signal(7) |
| `systemd.unit.5.md` | Unit file syntax, dependencies, ordering | man7.org systemd.unit(5) |
| `systemd.service.5.md` | Service units: Type=, Restart=, NotifyAccess=, WatchdogSec=, sandboxing | man7.org systemd.service(5) |
| `sd_notify.3.md` | sd_notify(3): READY=1 / WATCHDOG=1 readiness and watchdog protocol | man7.org sd_notify(3) |
| `launchd.plist.5.md` | launchd.plist(5): KeepAlive, RunAtLoad, ThrottleInterval, ProcessType, Sockets | xcode-man-pages |
| `windows-services-overview.md` | SCM service application model | Microsoft Learn |
| `windows-service-control-manager.md` | Service Control Manager role | Microsoft Learn |
| `windows-service-status-transitions.md` | SERVICE_STATUS states, SetServiceStatus reporting | Microsoft Learn |
| `windows-service-failure-actions.md` | SERVICE_FAILURE_ACTIONS: restart/reboot/run-command recovery | Microsoft Learn |

## Synthesis (curated)

| File | Topic |
|------|-------|
| `pid-files.md` | PID files: single-instance, locking, stale detection, pid reuse |
| `respawn-managers.md` | Restart/supervision across systemd, launchd, SCM, runit, s6, supervisord, pm2 |
| `windows-services.md` | Windows service lifecycle, crash behavior, recovery semantics, practical ops |

## Cross-OS comparison at a glance

| Concern | Linux (systemd) | macOS (launchd) | Windows (SCM) |
|---------|-----------------|-----------------|---------------|
| Unit definition | .service unit file | launchd.plist | registry entry via SCM API |
| Crash restart | `Restart=` policy + `RestartSec=` | `KeepAlive` | failure actions (`SC_ACTION_RESTART`) |
| Crash-loop guard | `StartLimitIntervalSec` / `StartLimitBurst` | `ThrottleInterval` (10s default) | failure count + `dwResetPeriod`, last action repeats |
| Readiness signal | `sd_notify` READY=1 (`Type=notify`) | no native readiness (poll socket/port) | report `SERVICE_RUNNING` via `SetServiceStatus` |
| Watchdog | `WatchdogSec=` + WATCHDOG=1 | no native watchdog (Use `KeepAlive` + custom) | no native watchdog; `SERVICE_START_PENDING` timeout ~30s/125s |
| Hangs (not crashes) | watchdog + `TimeoutStartSec`/`TimeoutStopSec` | `ExitTimeOut` only on stop | `SERVICE_STOP_PENDING` watchdog ~125s; no run watchdog |
| Auto-start | `WantedBy=multi-user.target` | `RunAtLoad` + `KeepAlive` | Start Type: Automatic / Delayed |
| Logs | journald (`StandardOutput=journal`) | unified log / syslog | Event Log (Event ID 7031/7034) |
| Single instance | pid file / `PIDFile=` | `launchd` per-label uniqueness | SCM per-service-name uniqueness |

## Reading order

1. `daemon.7.md` — what a daemon is, classic daemonization recipe.
2. `fork.2.md` + `signal.7.md` — the primitives.
3. `pid-files.md` — single-instance and stale detection (the classic bug source).
4. Pick your platform: `systemd.service.5.md` / `launchd.plist.5.md` / `windows-services.md`.
5. `respawn-managers.md` — cross-platform restart semantics and crash-loop design.

## Notes

- Downloaded 2026-07-31 from man7.org, xcode-man-pages (Keith Smiley), and Microsoft Learn.
- Raw pages are converted to markdown; the synthesis docs add cross-OS analysis not present in any single source.
- Arcana context: the engine daemon (packages/engine/src/daemon/) is a supervised background host; these docs cover the OS-level supervision models it interacts with (respawn, readiness, crash-loop backoff).
