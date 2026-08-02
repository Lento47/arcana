# Respawn Managers: Restart and Supervision Semantics, All OSes

Deep comparison of how each major supervisor decides to restart a dead daemon, how it avoids crash loops, and how it knows the daemon is actually ready. Raw reference pages: `systemd.service.5.md`, `launchd.plist.5.md`, `windows-service-failure-actions.md`.

## The three questions every supervisor answers

1. Restart decision: when the process exits, should it come back?
2. Crash-loop guard: how is a daemon that dies instantly on every start kept from burning CPU forever?
3. Readiness: when is the service considered up (for dependents, health checks, and status)?

## Linux: systemd

### Restart policy (`Restart=`)

| Value | Restarts when |
|-------|---------------|
| `no` | never (default) |
| `on-success` | exit code 0 or signals SIGHUP/SIGINT/SIGTERM/SIGPIPE |
| `on-failure` | non-zero exit, unclean signal, timeout, watchdog kill, or operation timeout |
| `on-abnormal` | unclean signal, timeout, watchdog (not non-zero exit) |
| `on-abort` | unclean signal only (SIGABRT, SIGSEGV, SIGBUS, SIGILL, SIGFPE, SIGQUIT, SIGSTKFLT) |
| `on-watchdog` | watchdog timeout only |
| `always` | any exit, including clean exit 0 |

`RestartSec=` (default 100 ms) is the delay before the restart. The clean-exit case is the one most people get wrong: `Restart=on-failure` does NOT restart on a normal exit 0, which is the correct behavior for a daemon that stops itself on request.

### Crash-loop guard

- `StartLimitIntervalSec=` + `StartLimitBurst=` (defaults: 10 s window, 5 starts): if the unit starts more than `burst` times within the interval, the unit enters `failed` state and is not restarted until manually reset (`systemctl reset-failed`) or the interval passes.
- `StartLimitAction=` can escalate (reboot, reboot-force, reboot-immediate).
- Counterpoint to naive backoff: systemd does not exponential-backoff inside the window; it hard-stops after the burst. The delay knob is `RestartSec=`, which you can grow manually or via a small script.

### Readiness and handoff

- `Type=simple`: systemd considers the unit started the moment the process forks. No readiness.
- `Type=exec`: same, but exec failure is detected.
- `Type=forking`: parent exit = started; the child is found via `PIDFile=`.
- `Type=notify`: the daemon must call `sd_notify(3)` `READY=1` (see `sd_notify.3.md`). This is the correct type for a daemon that must initialize before accepting work.
- `Type=dbus`: readiness = acquiring the named bus name.
- `Type=oneshot`: for short commands, not daemons.
- `TimeoutStartSec=` bounds how long `READY=1` may take before the unit is killed as failed.

### Watchdog (hang detection, not just crash)

`WatchdogSec=N` + `Restart=on-watchdog`/`on-failure` + the daemon sending `WATCHDOG=1` within every N seconds via `sd_notify`: if the ping stops, systemd kills the daemon and applies the restart policy. This is the only major supervisor with a first-class hang detector built in.

### Stopping

`TimeoutStopSec=` bounds SIGTERM to SIGKILL escalation. `KillSignal=` (default SIGTERM), `FinalKillSignal=` (SIGKILL). A daemon that ignores SIGTERM is SIGKILLed after the timeout.

## macOS: launchd

- `KeepAlive` controls restart: `true` restarts whenever the job exits (crash or clean); a dict lets you be precise:
  - `SuccessfulExit`: restart only when exit status was 0 (note the inversion: `true` means "restart on successful exit", unusual).
  - `FailedExit`: restart on non-zero exit.
  - `Crashed`: restart on signal death (the common case).
  - `OtherJobEnabled`: tie lifetime to another job.
- `RunAtLoad`: start at load. A daemon that should run at boot uses `RunAtLoad=true` + `KeepAlive=true`.
- Crash-loop guard: `ThrottleInterval` (default 10 s) is the minimum time between two launches of the same job. A job that dies instantly is relaunched at most once per 10 seconds. This is launchd's entire crash-loop defense, and 10 s is long enough to prevent CPU burn.
- Readiness: launchd has no READY=1 equivalent. Dependents use `LaunchEvents` (socket/queue activation) or poll. `Sockets` + `Accept` gives socket activation: launchd holds the listening socket, spawns the job on first connection, and readiness is implicit (the job inherits the accepted fd).
- Stopping: `ExitTimeOut` (default 20 s) before SIGKILL on stop. `AbandonProcessGroup` for jobs that spawn children.
- `ProcessType` (Background/Standard/Interactive/Adaptive/UI) influences scheduling priority and throttling.

## Windows: Service Control Manager

- No automatic crash restart by default. A service that dies stays dead until something calls `StartService` again.
- Restart comes from failure actions: `ChangeServiceConfig2(..., SERVICE_CONFIG_FAILURE_ACTIONS)` with a `SERVICE_FAILURE_ACTIONS` struct (see `windows-service-failure-actions.md`):
  - `lpActions`: up to 3 actions, applied in order per failure: `SC_ACTION_NONE`, `SC_ACTION_RESTART` (restart the service), `SC_ACTION_REBOOT` (reboot the machine), `SC_ACTION_RUN_COMMAND` (run an arbitrary command, the escape hatch for custom supervision).
  - Each action has a `Delay` in milliseconds (0 is allowed but unwise).
  - When failures exceed the number of actions, the last action repeats until the reset period expires.
  - `dwResetPeriod`: seconds without a failure after which the failure count resets. Default 0 = never reset.
- Failure actions fire only on unexpected termination. A clean stop (service reports STOPPED) does not count as a failure unless "Enable actions for stops with errors" is checked (Services.msc Recovery tab).
- Crash-loop guard: the repeating-last-action cycle + delay is the whole mechanism. There is no burst limit; a service that dies instantly will be restarted every `Delay` ms forever (with `SC_ACTION_RESTART`), which is why a non-zero delay and a final `SC_ACTION_NONE` or reboot escalation matter.
- Readiness: the service reports `SERVICE_RUNNING` via `SetServiceStatus` (see `windows-service-status-transitions.md`). SCM treats START_PENDING as not ready and applies the startup timeout (about 30 s for auto-start, 125 s for manual); exceeding it marks the service failed with `ERROR_SERVICE_SPECIFIC_ERROR`-adjacent status.
- Hang detection: none for a running service. `SERVICE_STOP_PENDING` has a watchdog (~125 s) after which SCM forces termination. A hung-but-running service is invisible to the SCM; recovery requires an external watchdog (health check + `sc stop/start` or `SC_ACTION_RUN_COMMAND`).
- Ops interfaces: Services.msc Recovery tab, `sc failure <name> reset= 86400 actions= restart/5000`, `sc qfailure <name>`, PowerShell `Set-Service`.

## runit and s6: the minimalist supervisors

- Model: `runsv`/`s6-supervise` runs one service directory; when the child exits, it is restarted immediately, unconditionally, with no policy and no backoff. Simple and predictable.
- Crash-loop guard: `s6` restarts with a default 1-second minimum between spawns (`s6-svscan` boot time); `runit` restarts immediately (a crash-looping service spins, but the supervisor itself stays healthy). Tools: `sv status`, `sv restart`, `s6-svc -r`.
- Readiness: `runit` has `./check` scripts (the `sv wait` mechanism waits for the check script to exit 0); s6 has `s6-svwait -U` (up) and readiness notification via `s6-svc -u` + fifo. Both are convention-based, not protocol-based.
- Logging: `./log` directory pairing (svlogd / s6-log) — the classic "one service, one logger" pattern that systemd's journal replaces.

## supervisord (Python)

- `autorestart=true` (default: `unexpected`), `startretries` (default 3), `startsecs` (default 1): the process must stay up for `startsecs` after a start for the start to count as successful; failed starts count against `startretries` before the program is given up on.
- `stopasgroup`/`killasgroup` for children. `stopsignal` (TERM/INT/QUIT/KILL). `exitcodes` (default 0, 2) defines "expected" exits.
- Crash-loop guard: `startsecs` + `startretries` is the stability-window pattern (also used by pm2), distinct from systemd's burst-limit pattern.

## pm2 (Node/Bun)

- Restarts on crash by default. `max_restarts` (default 15 in 30 s window... actually default: 15 restarts per 30 s? pm2 uses `max_restarts` with a default of 15 within a `min_uptime`-based window) with `min_uptime` (stability window, default 1000 ms): if the process stays up less than `min_uptime`, it counts as an unstable restart; exceeding `max_restarts` in 30 s marks it errored (`pm2 resurrect` needed).
- `restart_delay` (ms) and `exp_backoff_restart_delay` for exponential backoff.
- Readiness: no native protocol; health-check by polling the app port or `pm2 describe`.
- Useful for user-space Node daemons (including Bun processes) where systemd is overkill or unavailable.

## Cross-supervisor semantics table

| Supervisor | Restart trigger | Crash-loop guard | Readiness | Hang watchdog |
|------------|-----------------|------------------|-----------|---------------|
| systemd | exit-code policy (`Restart=`) | burst limit (10 s / 5 starts) | `Type=notify` READY=1 | `WatchdogSec=` native |
| launchd | `KeepAlive` (bool/dict) | `ThrottleInterval` 10 s min | socket activation / polling | none native |
| SCM | failure actions (RESTART/REBOOT/RUN_COMMAND) | repeating last action + delay, reset period | `SERVICE_RUNNING` report | none for running state |
| runit | unconditional immediate | none (1 s min in s6) | `./check` script | none |
| s6 | unconditional immediate | 1 s min | `s6-svwait -U` | none |
| supervisord | `autorestart` policy | `startsecs` + `startretries` | none (poll) | none |
| pm2 | crash default | `min_uptime` + `max_restarts` | none (poll) | none |

## Design guidance

1. Distinguish clean stop from crash: supervisors key on exit status and signal. Design the daemon so a requested stop exits 0 after a short drain, and reserve non-zero/signals for real failures. This makes `Restart=on-failure`-style policies safe.
2. Crash loops are the only restart failure mode that matters. Always configure the platform guard (burst limit, throttle interval, stability window) and a non-zero minimum delay between restarts.
3. Readiness is a protocol, not a sleep. Use `Type=notify`/`READY=1` on Linux, `SERVICE_RUNNING` on Windows, socket activation on macOS. A daemon that sleeps N seconds before serving work is racing its supervisor and its dependents.
4. Hangs are not crashes. Only systemd has a first-class watchdog. On other platforms, add an external health-check loop that kills and lets the supervisor restart.
5. Supervisors are per-platform; the daemon should not care which one runs it. Emit readiness, exit with meaningful codes, respond to SIGTERM/`ControlService` stop, and let the OS layer own restart policy.
