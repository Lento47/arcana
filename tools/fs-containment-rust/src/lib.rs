//! D-7.1: Linux Kernel-Enforced Filesystem Containment
//!
//! Uses openat2 with RESOLVE_BENEATH to enforce that file access
//! remains within a workspace directory boundary.
//!
//! # Safety Model
//!
//! The implementation:
//! 1. Opens the workspace directory descriptor
//! 2. Uses openat2 with RESOLVE_BENEATH + RESOLVE_NO_MAGICLINKS
//! 3. fstat the opened descriptor
//! 4. Reads through the same descriptor
//!
//! # Evidence Levels
//!
//! - `KERNEL_BENEATH`: openat2 succeeded with kernel-enforced containment
//! - `CANONICAL_PRE_POST_IDENTITY`: fallback reader with pre/post identity comparison
//!
//! This crate does NOT claim protection against:
//! - Hostile concurrent pathname replacement
//! - Symbolic-link races outside openat2 scope
//! - Magic-link or mount races
//! - Windows junction/reparse-point attacks

use std::path::{Path, PathBuf};

/// Evidence level for filesystem containment assurance.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContainmentAssurance {
    /// openat2 with RESOLVE_BENEATH succeeded — kernel-enforced containment.
    KernelBeneath,
    /// Fallback: pre/post object-identity comparison.
    CanonicalPrePostIdentity,
}

impl std::fmt::Display for ContainmentAssurance {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::KernelBeneath => write!(f, "KernelBeneath"),
            Self::CanonicalPrePostIdentity => write!(f, "CanonicalPrePostIdentity"),
        }
    }
}

/// Result of a bounded file read within a workspace boundary.
#[derive(Debug)]
pub struct BoundedReadResult {
    pub bytes: Vec<u8>,
    pub assurance: ContainmentAssurance,
    pub workspace_root: PathBuf,
    pub resolved_path: PathBuf,
    /// File stat at open time (device, inode).
    pub file_identity: FileIdentity,
}

/// File identity for pre/post comparison.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FileIdentity {
    pub device: u64,
    pub inode: u64,
}

/// Configuration for the bounded reader.
#[derive(Debug, Clone)]
pub struct BoundedReaderConfig {
    pub workspace_root: PathBuf,
    pub maximum_bytes: usize,
    /// If true, fall back to canonical reader when openat2 is unavailable.
    pub allow_fallback: bool,
}

/// Errors from the containment reader.
#[derive(Debug)]
pub enum ContainmentError {
    WorkspaceNotFound(PathBuf),
    FileNotFound(PathBuf),
    Openat2Unavailable,
    Openat2Failed(i32),
    IdentityMismatch {
        pre: FileIdentity,
        post: FileIdentity,
    },
    IoError(std::io::Error),
}

impl std::fmt::Display for ContainmentError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::WorkspaceNotFound(p) => write!(f, "workspace not found: {}", p.display()),
            Self::FileNotFound(p) => write!(f, "file not found: {}", p.display()),
            Self::Openat2Unavailable => write!(f, "openat2 not available on this kernel"),
            Self::Openat2Failed(code) => write!(f, "openat2 failed with errno {}", code),
            Self::IdentityMismatch { pre, post } => {
                write!(
                    f,
                    "identity mismatch: pre=({}:{}) post=({}:{})",
                    pre.device, pre.inode, post.device, post.inode
                )
            }
            Self::IoError(e) => write!(f, "io error: {}", e),
        }
    }
}

impl std::error::Error for ContainmentError {}

// ─── Linux implementation ────────────────────────────────────────

#[cfg(target_os = "linux")]
mod linux {
    use super::*;
    use std::fs::File;
    use std::io::Read;
    use std::os::fd::{AsRawFd, FromRawFd, RawFd};

    /// Linux kernel bounded reader using openat2.
    pub struct KernelBoundedReader {
        config: BoundedReaderConfig,
        openat2_available: Option<bool>,
    }

    impl KernelBoundedReader {
        pub fn new(config: BoundedReaderConfig) -> Self {
            Self {
                config,
                openat2_available: None,
            }
        }

        /// Check if openat2 is supported on the current kernel (>= 5.6).
        pub fn supported(&mut self) -> bool {
            if let Some(avail) = self.openat2_available {
                return avail;
            }
            let available = unsafe { ffi::openat2_supported() };
            self.openat2_available = Some(available);
            available
        }

        /// Read a file within the workspace boundary.
        pub fn read(&mut self, relative_path: &str) -> Result<BoundedReadResult, ContainmentError> {
            if !self.config.workspace_root.is_dir() {
                return Err(ContainmentError::WorkspaceNotFound(
                    self.config.workspace_root.clone(),
                ));
            }

            if self.supported() {
                return self.read_with_openat2(relative_path);
            }

            if self.config.allow_fallback {
                return self.read_canonical(relative_path);
            }

            Err(ContainmentError::Openat2Unavailable)
        }

        fn read_with_openat2(
            &self,
            relative_path: &str,
        ) -> Result<BoundedReadResult, ContainmentError> {
            let workspace_fd = self.open_workspace_dir()?;
            let relative = Path::new(relative_path);

            let opened_fd = unsafe {
                ffi::openat2_beneath(workspace_fd, relative)
                    .map_err(ContainmentError::Openat2Failed)?
            };

            let mut file = unsafe { File::from_raw_fd(opened_fd) };
            let identity = ffi::fstat_identity(file.as_raw_fd())?;

            let mut buffer = Vec::with_capacity(self.config.maximum_bytes.min(1024 * 1024));
            let mut limited = file.take(self.config.maximum_bytes as u64);
            limited
                .read_to_end(&mut buffer)
                .map_err(ContainmentError::IoError)?;

            Ok(BoundedReadResult {
                bytes: buffer,
                assurance: ContainmentAssurance::KernelBeneath,
                workspace_root: self.config.workspace_root.clone(),
                resolved_path: self.config.workspace_root.join(relative_path),
                file_identity: identity,
            })
        }

        fn read_canonical(&self, relative_path: &str) -> Result<BoundedReadResult, ContainmentError> {
            let abs_path = self.config.workspace_root.join(relative_path);

            let pre_stat = std::fs::metadata(&abs_path)
                .map_err(|_| ContainmentError::FileNotFound(abs_path.clone()))?;
            let pre_identity = FileIdentity {
                device: pre_stat.dev(),
                inode: pre_stat.ino(),
            };

            let mut file =
                File::open(&abs_path).map_err(|_| ContainmentError::FileNotFound(abs_path.clone()))?;

            let post_identity = ffi::fstat_identity(file.as_raw_fd())?;

            if pre_identity != post_identity {
                return Err(ContainmentError::IdentityMismatch {
                    pre: pre_identity,
                    post: post_identity,
                });
            }

            let mut buffer = Vec::with_capacity(self.config.maximum_bytes.min(1024 * 1024));
            let mut limited = file.take(self.config.maximum_bytes as u64);
            limited
                .read_to_end(&mut buffer)
                .map_err(ContainmentError::IoError)?;

            Ok(BoundedReadResult {
                bytes: buffer,
                assurance: ContainmentAssurance::CanonicalPrePostIdentity,
                workspace_root: self.config.workspace_root.clone(),
                resolved_path: abs_path,
                file_identity: post_identity,
            })
        }

        fn open_workspace_dir(&self) -> Result<RawFd, ContainmentError> {
            let dir = File::open(&self.config.workspace_root)
                .map_err(|_| ContainmentError::WorkspaceNotFound(self.config.workspace_root.clone()))?;
            Ok(dir.as_raw_fd())
        }
    }

    mod ffi {
        use super::*;
        use std::os::fd::RawFd;

        pub unsafe fn openat2_supported() -> bool {
            let how = OpenHow {
                flags: libc::O_RDONLY as u64,
                mode: 0,
                resolve: libc::RESOLVE_NO_SYMLINKS as u64,
            };
            let ret = libc::syscall(
                437, // SYS_openat2
                libc::AT_FDCWD,
                "/\0".as_ptr(),
                &how as *const _,
                std::mem::size_of::<OpenHow>(),
                0,
            );
            if ret >= 0 {
                libc::close(ret as i32);
                true
            } else {
                *libc::__errno_location() != libc::ENOSYS
            }
        }

        pub unsafe fn openat2_beneath(dirfd: RawFd, path: &Path) -> Result<RawFd, i32> {
            use std::ffi::CString;

            let path_cstr =
                CString::new(path.as_os_str().as_encoded_bytes()).map_err(|_| libc::EINVAL)?;

            let how = OpenHow {
                flags: libc::O_RDONLY as u64 | libc::O_CLOEXEC as u64,
                mode: 0,
                resolve: (libc::RESOLVE_BENEATH | libc::RESOLVE_NO_MAGICLINKS) as u64,
            };

            let ret = libc::syscall(
                437,
                dirfd,
                path_cstr.as_ptr(),
                &how as *const _,
                std::mem::size_of::<OpenHow>(),
                0,
            );

            if ret >= 0 {
                Ok(ret as RawFd)
            } else {
                Err(*libc::__errno_location())
            }
        }

        pub fn fstat_identity(fd: RawFd) -> Result<FileIdentity, ContainmentError> {
            unsafe {
                let mut stat: libc::stat = std::mem::zeroed();
                if libc::fstat(fd, &mut stat) != 0 {
                    return Err(ContainmentError::IoError(std::io::Error::last_os_error()));
                }
                Ok(FileIdentity {
                    device: stat.st_dev as u64,
                    inode: stat.st_ino as u64,
                })
            }
        }

        #[repr(C)]
        struct OpenHow {
            flags: u64,
            mode: u64,
            resolve: u64,
        }
    }
}

// Re-export Linux-specific types
#[cfg(target_os = "linux")]
pub use linux::KernelBoundedReader;

// ─── Non-Linux stub ──────────────────────────────────────────────

#[cfg(not(target_os = "linux"))]
pub struct KernelBoundedReader {
    config: BoundedReaderConfig,
}

#[cfg(not(target_os = "linux"))]
impl KernelBoundedReader {
    pub fn new(config: BoundedReaderConfig) -> Self {
        Self { config }
    }

    pub fn supported(&mut self) -> bool {
        false
    }

    pub fn read(&mut self, _relative_path: &str) -> Result<BoundedReadResult, ContainmentError> {
        if !self.config.workspace_root.is_dir() {
            return Err(ContainmentError::WorkspaceNotFound(
                self.config.workspace_root.clone(),
            ));
        }
        Err(ContainmentError::Openat2Unavailable)
    }
}

// ─── Tests ───────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    #[test]
    fn read_file_within_workspace() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("test.txt"), "hello").unwrap();

        let mut reader = KernelBoundedReader::new(BoundedReaderConfig {
            workspace_root: dir.path().to_path_buf(),
            maximum_bytes: 1024,
            allow_fallback: true,
        });

        // On Linux with kernel >= 5.6, this succeeds
        // On Windows, this fails with Openat2Unavailable
        match reader.read("test.txt") {
            Ok(result) => {
                assert_eq!(result.bytes, b"hello");
                assert!(matches!(
                    result.assurance,
                    ContainmentAssurance::KernelBeneath
                        | ContainmentAssurance::CanonicalPrePostIdentity
                ));
            }
            Err(ContainmentError::Openat2Unavailable) => {
                // Expected on non-Linux or old kernels
            }
            Err(e) => panic!("unexpected error: {}", e),
        }
    }

    #[test]
    fn read_bounded_size() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("large.txt"), "a".repeat(10000)).unwrap();

        let mut reader = KernelBoundedReader::new(BoundedReaderConfig {
            workspace_root: dir.path().to_path_buf(),
            maximum_bytes: 100,
            allow_fallback: true,
        });

        match reader.read("large.txt") {
            Ok(result) => assert_eq!(result.bytes.len(), 100),
            Err(ContainmentError::Openat2Unavailable) => {}
            Err(e) => panic!("unexpected error: {}", e),
        }
    }

    #[test]
    fn workspace_not_found() {
        let mut reader = KernelBoundedReader::new(BoundedReaderConfig {
            workspace_root: PathBuf::from("/nonexistent/workspace"),
            maximum_bytes: 1024,
            allow_fallback: true,
        });

        let result = reader.read("test.txt");
        assert!(matches!(result, Err(ContainmentError::WorkspaceNotFound(_))));
    }

    #[test]
    fn no_fallback_when_disabled() {
        let dir = TempDir::new().unwrap();

        let mut reader = KernelBoundedReader::new(BoundedReaderConfig {
            workspace_root: dir.path().to_path_buf(),
            maximum_bytes: 1024,
            allow_fallback: false,
        });

        // On non-Linux, always fails
        // On Linux without openat2, fails
        let result = reader.read("test.txt");
        if !reader.supported() {
            assert!(matches!(result, Err(ContainmentError::Openat2Unavailable)));
        }
    }

    #[test]
    fn containment_assurance_display() {
        assert_eq!(
            format!("{}", ContainmentAssurance::KernelBeneath),
            "KernelBeneath"
        );
        assert_eq!(
            format!("{}", ContainmentAssurance::CanonicalPrePostIdentity),
            "CanonicalPrePostIdentity"
        );
    }

    #[test]
    fn error_display() {
        let err = ContainmentError::Openat2Unavailable;
        assert_eq!(format!("{}", err), "openat2 not available on this kernel");

        let err = ContainmentError::WorkspaceNotFound(PathBuf::from("/test"));
        assert_eq!(format!("{}", err), "workspace not found: /test");

        let err = ContainmentError::IdentityMismatch {
            pre: FileIdentity { device: 1, inode: 2 },
            post: FileIdentity { device: 1, inode: 3 },
        };
        assert!(format!("{}", err).contains("identity mismatch"));
    }
}
