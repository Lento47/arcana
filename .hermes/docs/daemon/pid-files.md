# PID Files: Single Instance, Locking, and Stale Detection

Deep reference for the classic Unix pid file pattern and its modern variants. A pid file is a small file containing the daemon's process ID, used for three jobs: enforcing single instance, signaling the daemon (kill $(cat pidfile)), and letting supervisors (systemd, monitoring) find and verify the process.

## Why pid files exist

1. Single-instance enforcement: only one copy of the daemon may run per data directory or per service name.
2. Out-of-band signaling: shell scripts and operators send signals via `kill -TERM $(cat /run/foo.pid)`.
3. Supervisory integration: systemd `PIDFile=`, monit, and health checks read the file to locate the process.

The pid file is advisory, not a security boundary. A process that can write the pid file can also kill the daemon or fake it. Treat pid file location as root-owned for system daemons.

## Where pid files live

- Classic: `/var/run/<name>.pid`; modern Linux: `/run/<name>.pid` (`/run` is tmpfs, cleared on boot, which is the desired behavior).
- User daemons: `$XDG_RUNTIME_DIR/<name>.pid` (per-user, tmpfs, mode 0700).
- App-level daemons: `<data-dir>/<name>.pid`, or a lock file inside the data directory so the instance and its state live together.
- Windows: no pid file convention. Single-instance is done via named mutex/event, a named pipe, a lock file with `CreateFile` + exclusive share mode, or the SCM itself (a service name is unique).

## Writing the pid file correctly

The write itself is simple; the ordering and permissions are the subtle parts.

1. Create the file before or at the point where the daemon becomes addressable, not at startup. A pid file that exists before the process is ready invites a supervisor or operator to signal a process that is not fully initialized.
2. Write the pid as decimal ASCII followed by a newline: `1234\n`. No trailing garbage; parsers do `int(open(path).read().strip())`.
3. Use a restrictive mode: `umask 022` or explicit `chmod 0644` (must be world-readable for signaling by other users, 0600 if only the owner signals).
4. Do not fsync the pid file. It is recreatable metadata; durability is irrelevant and fsync on every daemon start is a pointless stall.
5. Do not use `O_TRUNC` on an existing file held by another live daemon without first verifying that daemon is dead (stale detection below).

## Single instance: the lock is the primitive, not the file

The correct single-instance primitive is an advisory lock held for the lifetime of the daemon, with the pid written inside the locked file. Two competing mechanisms:

| Mechanism | Call | Semantics | Pitfalls |
|-----------|------|-----------|----------|
| `flock(2)` | `flock(fd, LOCK_EX \| LOCK_NB)` | Lock belongs to the open file description; a second `open()` + `flock` in the same process still blocks/EBUSY correctly | Not inherited across fork unless the fd is shared; NFS historically broken (modern NFSv4 OK); locks vanish on last close |
| `fcntl(F_SETLK)` | `fcntl(fd, F_SETLK, ...)` | Lock belongs to the (pid, inode) pair; record-range locks | Locks are released on ANY close of the fd by the process; the classic "close(fd) in a library releases your lock" trap; a process can hold at most one lock per file region |

Rules that follow:

- Lock the file, then write the pid, then check: after acquiring the lock, re-read the file and confirm the pid is yours. A racer can write its pid between your open and your write otherwise.
- Hold the fd open for the daemon's lifetime. Closing it releases the lock.
- Do not use `O_TRUNC` after acquiring the lock while holding it for the whole run: truncating a locked file is fine (you own it), but never open a second fd and truncate while another process may be about to read.
- On startup failure, remove the pid file only if you created it and hold the lock. Blind `unlink()` deletes another instance's file.

## Stale detection

The danger: the pid file names a process that no longer exists (stale), or worse, a pid that has been recycled by an unrelated process.

1. First check the lock: if the file is flock/fcntl-locked by a live process, the daemon is running. Lock-based detection is the reliable primitive.
2. `kill(pid, 0)` semantics: returns 0 if the process exists and is signalable, -1 with `ESRCH` if it does not exist, -1 with `EPERM` if it exists but is owned by another user (which still means "exists").
3. Pid reuse: `ESRCH` is definitive only if the pid never comes back. On a busy system, check `/proc/<pid>/stat` field 22 (start time in clock ticks) against a recorded start time, or check the process comm/cmdline matches the daemon name, before declaring the old instance dead.
4. systemd does this for you: with `PIDFile=` and `Type=forking`, systemd reads the file, verifies the process is the child it spawned, and refuses to treat a recycled pid as the daemon. Do not hand-roll this inside a systemd unit.

## Stale pid removal policy

- If the lock is free, the file is stale by definition. You may remove and recreate it.
- If the lock is held, the daemon is alive. Never remove the file, never truncate it.
- Crash recovery: after a crash the lock is released by the kernel automatically (locks die with the process). The stale file remains until the next start, which detects the free lock and reclaims the file. This is why the lock, not the file's existence, is the source of truth.

## systemd specifics

- `Type=forking` requires `PIDFile=` so systemd can find the child that became the daemon and track it (including kill-on-stop and `RemainAfterExit` accounting).
- `Type=simple` (the recommended default) should NOT set `PIDFile=`; systemd treats the main process as the daemon and a pid file is redundant and a known source of misdetection.
- `RuntimeDirectory=` gives a root-owned, boot-cleared directory for the pid file without touching `/run` permissions.

## Windows equivalent

- The SCM enforces single instance by service name: you cannot register two services with the same name, and a running service owns its name. No pid file needed for SCM-managed services.
- For user-mode single instance (no SCM): named mutex (`CreateMutex(NULL, TRUE, "Local\\<name>")` — `ERROR_ALREADY_EXISTS`), named pipe with exclusive create, or a lock file opened with `CreateFile(..., FILE_SHARE_READ, ...)` where a second open fails with sharing violation.
- Pid equivalents: `GetCurrentProcessId()`, but for signaling use `OpenProcess` + `PostThreadMessage`/`TerminateProcess` or better, named events/pipes — handles, not pids, are the Windows idiom.

## Checklist for a new daemon

1. Lock file (flock/fcntl/named mutex) acquired before anything else touches shared state.
2. Pid written only after the daemon is ready to be signaled safely.
3. Pid file mode and location correct for the deployment model (root vs user).
4. Stale file reclaimed via lock check, never via existence check.
5. Supervisor configured to use the platform's native tracking (systemd `PIDFile=` only for `Type=forking`; SCM name uniqueness; launchd per-label uniqueness).
