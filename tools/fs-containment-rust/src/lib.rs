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
//!
//! Windows: `WindowsBoundedReader` validates containment through the
//! opened handle (final-path query + volume/file identity + reparse-point
//! rejection) rather than trusting the requested path. It is a user-space
//! enforcement boundary: it detects substitution and reparse escapes, but it
//! is not a kernel ACL.

use std::path::{Path, PathBuf};

/// Evidence level for filesystem containment assurance.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContainmentAssurance {
    /// openat2 with RESOLVE_BENEATH succeeded — kernel-enforced containment.
    KernelBeneath,
    /// Fallback: pre/post object-identity comparison.
    CanonicalPrePostIdentity,
    /// Windows: opened-handle final path validated against the workspace
    /// boundary with volume/file identity and reparse-point rejection.
    WindowsFinalPathHandle,
}

impl std::fmt::Display for ContainmentAssurance {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::KernelBeneath => write!(f, "KernelBeneath"),
            Self::CanonicalPrePostIdentity => write!(f, "CanonicalPrePostIdentity"),
            Self::WindowsFinalPathHandle => write!(f, "WindowsFinalPathHandle"),
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
    /// Windows: the opened handle's final path escaped the workspace root.
    OutsideWorkspace {
        requested: PathBuf,
        resolved: PathBuf,
    },
    /// Windows: the opened object is a reparse point (junction/symlink).
    ReparsePointRejected(PathBuf),
    /// Windows: the requested path contains lexical traversal (`..`) or is
    /// absolute, which is rejected before any filesystem access.
    PathTraversalRejected(PathBuf),
    /// Windows: final path could not be queried from the opened handle.
    FinalPathQueryFailed,
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
            Self::OutsideWorkspace { requested, resolved } => write!(
                f,
                "resolved path escapes workspace: requested={} resolved={}",
                requested.display(),
                resolved.display()
            ),
            Self::ReparsePointRejected(p) => {
                write!(f, "reparse point rejected: {}", p.display())
            }
            Self::PathTraversalRejected(p) => {
                write!(f, "path traversal rejected: {}", p.display())
            }
            Self::FinalPathQueryFailed => write!(f, "failed to query final path from handle"),
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
        openat2_available: std::cell::Cell<Option<bool>>,
    }

    impl KernelBoundedReader {
        pub fn new(config: BoundedReaderConfig) -> Self {
            Self {
                config,
                openat2_available: std::cell::Cell::new(None),
            }
        }

        /// Check if openat2 is supported on the current kernel (>= 5.6).
        pub fn supported(&self) -> bool {
            if let Some(avail) = self.openat2_available.get() {
                return avail;
            }
            let available = unsafe { ffi::openat2_supported() };
            self.openat2_available.set(Some(available));
            available
        }

        /// Read a file within the workspace boundary.
        pub fn read(&self, relative_path: &str) -> Result<BoundedReadResult, ContainmentError> {
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

            let file = unsafe { File::from_raw_fd(opened_fd) };
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

            let file =
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

// ─── Windows implementation ──────────────────────────────────────

#[cfg(target_os = "windows")]
mod windows_impl {
    use super::*;
    use std::fs::File;
    use std::io::Read;
    use std::os::windows::io::AsRawHandle;
    use windows_sys::Win32::Foundation::{GetLastError, HANDLE};
    use windows_sys::Win32::Storage::FileSystem::{
        GetFileInformationByHandle, GetFinalPathNameByHandleW, BY_HANDLE_FILE_INFORMATION,
        FILE_ATTRIBUTE_REPARSE_POINT, FILE_NAME_NORMALIZED,
    };

    /// Windows bounded reader: containment is proven from the opened handle,
    /// never from the requested path.
    pub struct WindowsBoundedReader {
        config: BoundedReaderConfig,
    }

    impl WindowsBoundedReader {
        pub fn new(config: BoundedReaderConfig) -> Self {
            Self { config }
        }

        /// Windows handle-based containment is always available on supported
        /// Windows versions (Vista+ final-path API).
        pub fn supported(&self) -> bool {
            true
        }

        pub fn read(&self, relative_path: &str) -> Result<BoundedReadResult, ContainmentError> {
            let workspace = std::fs::canonicalize(&self.config.workspace_root).map_err(|_| {
                ContainmentError::WorkspaceNotFound(self.config.workspace_root.clone())
            })?;

            reject_traversal(relative_path)?;

            let requested = workspace.join(relative_path);
            check_reparse_components(&workspace, relative_path)?;

            let file = File::open(&requested)
                .map_err(|_| ContainmentError::FileNotFound(requested.clone()))?;
            let handle = file.as_raw_handle() as HANDLE;

            let mut info: BY_HANDLE_FILE_INFORMATION = unsafe { std::mem::zeroed() };
            if unsafe { GetFileInformationByHandle(handle, &mut info) } == 0 {
                return Err(ContainmentError::IoError(std::io::Error::last_os_error()));
            }

            // Reparse points (junctions, symlinks, mount points) are never
            // followed: the workspace boundary must be lexical at the object
            // identity level.
            if info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
                return Err(ContainmentError::ReparsePointRejected(requested));
            }

            let final_path = final_path_from_handle(handle)?;
            if !path_within(&final_path, &workspace) {
                return Err(ContainmentError::OutsideWorkspace {
                    requested,
                    resolved: final_path,
                });
            }

            let mut buffer = Vec::with_capacity(self.config.maximum_bytes.min(1024 * 1024));
            let mut limited = file.take(self.config.maximum_bytes as u64);
            limited
                .read_to_end(&mut buffer)
                .map_err(ContainmentError::IoError)?;

            let file_identity = FileIdentity {
                device: info.dwVolumeSerialNumber as u64,
                inode: ((info.nFileIndexHigh as u64) << 32) | info.nFileIndexLow as u64,
            };

            Ok(BoundedReadResult {
                bytes: buffer,
                assurance: ContainmentAssurance::WindowsFinalPathHandle,
                workspace_root: workspace.clone(),
                resolved_path: final_path,
                file_identity,
            })
        }
    }

    /// Reject absolute paths and any `..` component before touching the
    /// filesystem.
    fn reject_traversal(relative_path: &str) -> Result<(), ContainmentError> {
        let p = Path::new(relative_path);
        if p.is_absolute() {
            return Err(ContainmentError::PathTraversalRejected(
                relative_path.into(),
            ));
        }
        if p.components().any(|c| c == std::path::Component::ParentDir) {
            return Err(ContainmentError::PathTraversalRejected(
                relative_path.into(),
            ));
        }
        Ok(())
    }

    /// Walk every path component from the workspace root and reject reparse
    /// points (junctions, symlinks, mount points) before opening.
    fn check_reparse_components(
        workspace: &Path,
        relative_path: &str,
    ) -> Result<(), ContainmentError> {
        let mut current = workspace.to_path_buf();
        for component in Path::new(relative_path).components() {
            if let std::path::Component::Normal(part) = component {
                current.push(part);
                let meta = match std::fs::symlink_metadata(&current) {
                    Ok(m) => m,
                    Err(_) => return Ok(()), // missing tail handled by open
                };
                if is_reparse(&meta) {
                    return Err(ContainmentError::ReparsePointRejected(current));
                }
            }
        }
        Ok(())
    }

    fn is_reparse(meta: &std::fs::Metadata) -> bool {
        use std::os::windows::fs::MetadataExt;
        meta.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0
    }

    /// Query `GetFinalPathNameByHandleW` with FILE_NAME_NORMALIZED, growing
    /// the buffer until it fits.
    fn final_path_from_handle(handle: HANDLE) -> Result<PathBuf, ContainmentError> {
        let mut capacity: u32 = 512;
        loop {
            let mut buf = vec![0u16; capacity as usize];
            let len = unsafe {
                GetFinalPathNameByHandleW(
                    handle,
                    buf.as_mut_ptr(),
                    buf.len() as u32,
                    FILE_NAME_NORMALIZED,
                )
            };
            if len == 0 {
                let code = unsafe { GetLastError() };
                if code == windows_sys::Win32::Foundation::ERROR_INSUFFICIENT_BUFFER {
                    capacity = capacity.saturating_mul(2).max(capacity + 256);
                    continue;
                }
                return Err(ContainmentError::FinalPathQueryFailed);
            }
            if (len as usize) < buf.len() {
                buf.truncate(len as usize);
                return Ok(PathBuf::from(
                    String::from_utf16_lossy(&buf).trim_end_matches('\0').to_owned(),
                ));
            }
            capacity = capacity.saturating_mul(2).max(capacity + 256);
        }
    }

    /// Case-insensitive, volume-aware containment test.
    ///
    /// Both paths originate from the OS (canonicalized workspace and
    /// handle-final path), so NTFS case-insensitivity is handled by
    /// `eq_ignore_ascii_case`. The `\\?\` prefix from the final-path API is
    /// stripped before comparison.
    fn path_within(final_path: &Path, workspace: &Path) -> bool {
        fn norm(p: &Path) -> String {
            let s = p.to_string_lossy().replace('/', "\\");
            let s = s.strip_prefix("\\\\?\\").unwrap_or(&s);
            s.trim_end_matches('\\').to_string()
        }
        let f = norm(final_path);
        let w = norm(workspace);
        f == w || f.starts_with(&format!("{}\\", w))
    }
}

#[cfg(target_os = "windows")]
pub use windows_impl::WindowsBoundedReader;

// ─── Non-Linux/non-Windows stub ──────────────────────────────────

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
pub struct KernelBoundedReader {
    config: BoundedReaderConfig,
}

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
impl KernelBoundedReader {
    pub fn new(config: BoundedReaderConfig) -> Self {
        Self { config }
    }

    pub fn supported(&self) -> bool {
        false
    }

    pub fn read(&self, _relative_path: &str) -> Result<BoundedReadResult, ContainmentError> {
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

    #[cfg(target_os = "linux")]
    fn new_reader(config: BoundedReaderConfig) -> KernelBoundedReader {
        KernelBoundedReader::new(config)
    }

    #[cfg(target_os = "windows")]
    fn new_reader(config: BoundedReaderConfig) -> WindowsBoundedReader {
        WindowsBoundedReader::new(config)
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows")))]
    fn new_reader(config: BoundedReaderConfig) -> KernelBoundedReader {
        KernelBoundedReader::new(config)
    }

    fn assurance_ok(a: ContainmentAssurance) -> bool {
        matches!(
            a,
            ContainmentAssurance::KernelBeneath
                | ContainmentAssurance::CanonicalPrePostIdentity
                | ContainmentAssurance::WindowsFinalPathHandle
        )
    }

    #[test]
    fn read_file_within_workspace() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("test.txt"), "hello").unwrap();

        let reader = new_reader(BoundedReaderConfig {
            workspace_root: dir.path().to_path_buf(),
            maximum_bytes: 1024,
            allow_fallback: true,
        });

        // On Linux with kernel >= 5.6 this succeeds; on Windows the
        // handle-based reader succeeds; on other platforms it is a stub.
        match reader.read("test.txt") {
            Ok(result) => {
                assert_eq!(result.bytes, b"hello");
                assert!(assurance_ok(result.assurance));
            }
            Err(ContainmentError::Openat2Unavailable) => {
                // Expected on non-Linux/non-Windows or old Linux kernels.
            }
            Err(e) => panic!("unexpected error: {}", e),
        }
    }

    #[test]
    fn read_bounded_size() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("large.txt"), "a".repeat(10000)).unwrap();

        let reader = new_reader(BoundedReaderConfig {
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
        let reader = new_reader(BoundedReaderConfig {
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

        let reader = new_reader(BoundedReaderConfig {
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
        assert_eq!(
            format!("{}", ContainmentAssurance::WindowsFinalPathHandle),
            "WindowsFinalPathHandle"
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

        let err = ContainmentError::PathTraversalRejected(PathBuf::from("../x"));
        assert!(format!("{}", err).contains("path traversal rejected"));

        let err = ContainmentError::ReparsePointRejected(PathBuf::from("link"));
        assert!(format!("{}", err).contains("reparse point rejected"));
    }

    #[cfg(target_os = "windows")]
    mod windows_tests {
        use super::*;

        #[test]
        fn read_within_workspace_returns_handle_assurance() {
            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("ok.txt"), "inside").unwrap();

            let reader = new_reader(BoundedReaderConfig {
                workspace_root: dir.path().to_path_buf(),
                maximum_bytes: 1024,
                allow_fallback: true,
            });

            let result = reader.read("ok.txt").expect("read should succeed");
            assert_eq!(result.bytes, b"inside");
            assert_eq!(
                result.assurance,
                ContainmentAssurance::WindowsFinalPathHandle
            );
            assert!(result.file_identity.device != 0 || result.file_identity.inode != 0);
        }

        #[test]
        fn traversal_outside_workspace_is_rejected() {
            let dir = TempDir::new().unwrap();
            let parent = dir.path().parent().unwrap().to_path_buf();
            let outside = parent.join(format!(
                "outside-{}.txt",
                std::process::id()
            ));
            fs::write(&outside, "outside").unwrap();

            let reader = new_reader(BoundedReaderConfig {
                workspace_root: dir.path().to_path_buf(),
                maximum_bytes: 1024,
                allow_fallback: true,
            });

            let rel = format!("..\\{}", outside.file_name().unwrap().to_string_lossy());
            let result = reader.read(&rel);
            assert!(
                matches!(result, Err(ContainmentError::PathTraversalRejected(_))),
                "traversal must be rejected lexically, got {:?}",
                result.err()
            );
            fs::remove_file(&outside).ok();
        }

        #[test]
        fn reparse_point_escape_is_rejected() {
            let dir = TempDir::new().unwrap();
            let outside_dir = TempDir::new().unwrap();
            fs::write(outside_dir.path().join("secret.txt"), "secret").unwrap();

            let link = dir.path().join("link");
            // Directory symlinks require developer mode or elevation; skip
            // the fixture silently when the OS refuses to create it.
            if std::os::windows::fs::symlink_dir(outside_dir.path(), &link).is_err() {
                return;
            }

            let reader = new_reader(BoundedReaderConfig {
                workspace_root: dir.path().to_path_buf(),
                maximum_bytes: 1024,
                allow_fallback: true,
            });

            let result = reader.read("link\\secret.txt");
            assert!(
                matches!(result, Err(ContainmentError::ReparsePointRejected(_))),
                "reparse escape must be rejected, got {:?}",
                result.err()
            );
            fs::remove_dir_all(&link).ok();
        }

        #[test]
        fn bounded_size_on_windows() {
            let dir = TempDir::new().unwrap();
            fs::write(dir.path().join("large.txt"), "a".repeat(10_000)).unwrap();

            let reader = new_reader(BoundedReaderConfig {
                workspace_root: dir.path().to_path_buf(),
                maximum_bytes: 100,
                allow_fallback: true,
            });

            let result = reader.read("large.txt").expect("read should succeed");
            assert_eq!(result.bytes.len(), 100);
        }
    }
}
