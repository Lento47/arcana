# fork(2) - Linux manual page

NAME  top

       fork - create a child process

LIBRARY  top

       Standard C library (libc, -lc)

SYNOPSIS  top

       #include <unistd.h>

       pid_t fork(void);

DESCRIPTION  top

       fork() creates a new process by duplicating the calling process.
       The new process is referred to as the child process.  The calling
       process is referred to as the parent process.

       The child process and the parent process run in separate memory
       spaces.  At the time of fork() both memory spaces have the same
       content.  Memory writes, file mappings (mmap(2)), and unmappings
       (munmap(2)) performed by one of the processes do not affect the
       other.

       The child process is an exact duplicate of the parent process
       except for the following points:

       •  The child has its own unique process ID, and this PID does not
          match the ID of any existing process group (setpgid(2)) or
          session.

       •  The child's parent process ID is the same as the parent's
          process ID.

       •  The child does not inherit its parent's memory locks (mlock(2),
          mlockall(2)).

       •  Process resource utilizations (getrusage(2)) and CPU time
          counters (times(2)) are reset to zero in the child.

       •  The child's set of pending signals is initially empty
          (sigpending(2)).

       •  The child does not inherit semaphore adjustments from its
          parent (semop(2)).

       •  The child does not inherit process-associated record locks from
          its parent (fcntl(2)).  (On the other hand, it does inherit
          fcntl(2) open file description locks and flock(2) locks from
          its parent.)

       •  The child does not inherit timers from its parent
          (setitimer(2), alarm(2), timer_create(2)).

       •  The child does not inherit outstanding asynchronous I/O
          operations from its parent (aio_read(3), aio_write(3)), nor
          does it inherit any asynchronous I/O contexts from its parent
          (see io_setup(2)).

       The process attributes in the preceding list are all specified in
       POSIX.1.  The parent and child also differ with respect to the
       following Linux-specific process attributes:

       •  The child does not inherit directory change notifications
          (dnotify) from its parent (see the description of F_NOTIFY in
          fcntl(2)).

       •  The prctl(2) PR_SET_PDEATHSIG setting is reset so that the
          child does not receive a signal when its parent terminates.

       •  The default timer slack value is set to the parent's current
          timer slack value.  See the description of PR_SET_TIMERSLACK in
          prctl(2).

       •  Memory mappings that have been marked with the madvise(2)
          MADV_DONTFORK flag are not inherited across a fork().

       •  Memory in address ranges that have been marked with the
          madvise(2) MADV_WIPEONFORK flag is zeroed in the child after a
          fork().  (The MADV_WIPEONFORK setting remains in place for
          those address ranges in the child.)

       •  The termination signal of the child is always SIGCHLD (see
          clone(2)).

       •  The port access permission bits set by ioperm(2) are not
          inherited by the child; the child must turn on any bits that it
          requires using ioperm(2).

       Note the following further points:

       •  The child process is created with a single thread—the one that
          called fork().  The entire virtual address space of the parent
          is replicated in the child, including the states of mutexes,
          condition variables, and other pthreads objects; the use of
          pthread_atfork(3) may be helpful for dealing with problems that
          this can cause.

       •  After a fork() in a multithreaded program, the child can safely
          call only async-signal-safe functions (see signal-safety(7))
          until such time as it calls execve(2).

       •  The child inherits copies of the parent's set of open file
          descriptors.  Each file descriptor in the child refers to the
          same open file description (see open(2)) as the corresponding
          file descriptor in the parent.  This means that the two file
          descriptors share open file status flags, file offset, and
          signal-driven I/O attributes (see the description of F_SETOWN
          and F_SETSIG in fcntl(2)).

       •  The child inherits copies of the parent's set of open message
          queue descriptors (see mq_overview(7)).  Each file descriptor
          in the child refers to the same open message queue description
          as the corresponding file descriptor in the parent.  This means
          that the two file descriptors share the same flags (mq_flags).

       •  The child inherits copies of the parent's set of open directory
          streams (see opendir(3)).  POSIX.1 says that the corresponding
          directory streams in the parent and child may share the
          directory stream positioning; on Linux/glibc they do not.

RETURN VALUE  top

       On success, the PID of the child process is returned in the
       parent, and 0 is returned in the child.  On failure, -1 is
       returned in the parent, no child process is created, and errno is
       set to indicate the error.

ERRORS  top

       EAGAIN A system-imposed limit on the number of threads was
              encountered.  There are a number of limits that may trigger
              this error:

              •  the RLIMIT_NPROC soft resource limit (set via
                 setrlimit(2)), which limits the number of processes and
                 threads for a real user ID, was reached;

              •  the kernel's system-wide limit on the number of
                 processes and threads, /proc/sys/kernel/threads-max, was
                 reached (see proc(5));

              •  the maximum number of PIDs, /proc/sys/kernel/pid_max,
                 was reached (see proc(5)); or

              •  the PID limit (pids.max) imposed by the cgroup "process
                 number" (PIDs) controller was reached.

       EAGAIN The caller is operating under the SCHED_DEADLINE scheduling
              policy and does not have the reset-on-fork flag set.  See
              sched(7).

       ENOMEM fork() failed to allocate the necessary kernel structures
              because memory is tight.

       ENOMEM An attempt was made to create a child process in a PID
              namespace whose "init" process has terminated.  See
              pid_namespaces(7).

       ENOSYS fork() is not supported on this platform (for example,
              hardware without a Memory-Management Unit).

       ERESTARTNOINTR (since Linux 2.6.17)
              System call was interrupted by a signal and will be
              restarted.  (This can be seen only during a trace.)

VERSIONS  top

   C library/kernel differences
       Since glibc 2.3.3, rather than invoking the kernel's fork() system
       call, the glibc fork() wrapper that is provided as part of the
       NPTL threading implementation invokes clone(2) with flags that
       provide the same effect as the traditional system call.  (A call
       to fork() is equivalent to a call to clone(2) specifying flags as
       just SIGCHLD.)  The glibc wrapper invokes any fork handlers that
       have been established using pthread_atfork(3).

   Async-signal safety
       _Fork(3) is an async-signal safe variant of fork(2).

STANDARDS  top

       POSIX.1-2024.

HISTORY  top

       4.3BSD, SVr4, POSIX.1-1988.

NOTES  top

       Under Linux, fork() is implemented using copy-on-write pages, so
       the only penalty that it incurs is the time and memory required to
       duplicate the parent's page tables, and to create a unique task
       structure for the child.

EXAMPLES  top

       See pipe(2) and wait(2) for more examples.

       #include <signal.h>
       #include <stdint.h>
       #include <stdio.h>
       #include <stdlib.h>
       #include <sys/types.h>
       #include <unistd.h>

       int
       main(void)
       {
           pid_t pid;

           if (signal(SIGCHLD, SIG_IGN) == SIG_ERR) {
               perror("signal");
               exit(EXIT_FAILURE);
           }
           pid = fork();
           switch (pid) {
           case -1:
               perror("fork");
               exit(EXIT_FAILURE);
           case 0:
               puts("Child exiting.");
               fflush(stdout);
               _exit(EXIT_SUCCESS);
           default:
               printf("Child is PID %jd\n", (intmax_t) pid);
               puts("Parent exiting.");
               exit(EXIT_SUCCESS);
           }
       }

SEE ALSO  top

       clone(2), execve(2), exit(2), _exit(2), setrlimit(2), unshare(2),
       vfork(2), wait(2), daemon(3), _Fork(3), pthread_atfork(3),
       capabilities(7), credentials(7)

COLOPHON  top

       This page is part of the man-pages (Linux kernel and C library
       user-space interface documentation) project.  Information about
       the project can be found at
       ⟨https://www.kernel.org/doc/man-pages/⟩.  If you have a bug report
       for this manual page, see
       ⟨https://git.kernel.org/pub/scm/docs/man-pages/man-pages.git/tree/CONTRIBUTING⟩.
       This page was obtained from the tarball man-pages-6.18.tar.gz
       fetched from
       ⟨https://mirrors.edge.kernel.org/pub/linux/docs/man-pages/⟩ on
       2026-05-24.  If you discover any rendering problems in this HTML
       version of the page, or you believe there is a better or more up-
       to-date source for the page, or you have corrections or
       improvements to the information in this COLOPHON (which is not
       part of the original manual page), send a mail to
       man-pages@man7.org

Linux man-pages 6.18            2026-02-08                        fork(2)

Pages that refer to this page:  chrt(1) ,  dbpmda(1) ,  pmcd(1) ,  setsid(1) ,  strace(1) ,  xargs(1) ,  alarm(2) ,  arch_prctl(2) ,  bpf(2) ,  chdir(2) ,  chroot(2) ,  clone(2) ,  eventfd(2) ,  execve(2) ,  _exit(2) ,  fcntl_locking(2) ,  F_GETDELEG(2const) ,  F_GETFD(2const) ,  F_GETFL(2const) ,  F_GETLEASE(2const) ,  flock(2) ,  fork(2) ,  getitimer(2) ,  getpid(2) ,  getpriority(2) ,  getrlimit(2) ,  gettid(2) ,  ioperm(2) ,  iopl(2) ,  kcmp(2) ,  KEYCTL_SET_REQKEY_KEYRING(2const) ,  lseek(2) ,  madvise(2) ,  memfd_create(2) ,  memfd_secret(2) ,  mlock(2) ,  mmap(2) ,  mount(2) ,  nice(2) ,  open(2) ,  perf_event_open(2) ,  pidfd_open(2) ,  pipe(2) ,  PR_MPX_ENABLE_MANAGEMENT(2const) ,  PR_SET_CHILD_SUBREAPER(2const) ,  PR_SET_IO_FLUSHER(2const) ,  PR_SET_MDWE(2const) ,  PR_SET_NO_NEW_PRIVS(2const) ,  PR_SET_PDEATHSIG(2const) ,  PR_SET_SYSCALL_USER_DISPATCH(2const) ,  PR_SET_TAGGED_ADDR_CTRL(2const) ,  PR_SET_THP_DISABLE(2const) ,  PR_SET_TIMERSLACK(2const) ,  PR_SVE_SET_VL(2const) ,  ptrace(2) ,  sched_setaffinity(2) ,  sched_setattr(2) ,  sched_setscheduler(2) ,  seccomp(2) ,  select_tut(2) ,  semop(2) ,  set_mempolicy(2) ,  setns(2) ,  setpgid(2) ,  setsid(2) ,  shmop(2) ,  sigaction(2) ,  sigaltstack(2) ,  signalfd(2) ,  sigpending(2) ,  sigprocmask(2) ,  syscalls(2) ,  timer_create(2) ,  timerfd_create(2) ,  UFFDIO_API(2const) ,  UFFDIO_MOVE(2const) ,  umask(2) ,  unshare(2) ,  userfaultfd(2) ,  vfork(2) ,  wait(2) ,  wait4(2) ,  atexit(3) ,  cap_launch(3) ,  daemon(3) ,  exec(3) ,  _Fork(3) ,  ibv_fork_init(3) ,  ibv_is_fork_initialized(3) ,  id_t(3type) ,  io_uring_register_bpf_filter(3) ,  io_uring_register_bpf_filter_task(3) ,  io_uring_ring_dontfork(3) ,  lttng-ust(3) ,  on_exit(3) ,  openpty(3) ,  pam_end(3) ,  pam_set_data(3) ,  __pmprocessexec(3) ,  __pmprocesspipe(3) ,  popen(3) ,  posix_spawn(3) ,  pthread_atfork(3) ,  sd_bus_creds_get_pid(3) ,  sd_varlink_connect_address(3) ,  sem_init(3) ,  system(3) ,  core(5) ,  proc_pid_oom_score(5) ,  proc_sys_kernel(5) ,  systemd.exec(5) ,  capabilities(7) ,  cgroups(7) ,  cpuset(7) ,  credentials(7) ,  environ(7) ,  epoll(7) ,  mq_overview(7) ,  persistent-keyring(7) ,  pid_namespaces(7) ,  pipe(7) ,  pthreads(7) ,  rpm-lua(7) ,  sched(7) ,  session-keyring(7) ,  signal(7) ,  thread-keyring(7) ,  user-keyring(7) ,  user_namespaces(7) ,  user-session-keyring(7) ,  btrfs-balance(8) ,  lslocks(8) ,  trafgen(8)

 HTML rendering created 2026-05-30 by  Michael Kerrisk , author of  The Linux Programming Interface .

 For details of in-depth  Linux/UNIX system programming training courses  that I teach, look  here .

 Hosting by  jambit GmbH .
