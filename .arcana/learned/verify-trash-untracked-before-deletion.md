---
tags: [git, cleanup]
date: 2026-08-28
source: ses_fbac982d6ffebcaiMIiwY8Mejc
---
# verify trash untracked before deletion

Use git check-ignore to verify trash untracked before recommending deletion

**Why:** Deleting tracked files is destructive; need confirm they are ignored.
**How to apply:** Run `git check-ignore` on suspect paths; only recommend removal if ignored.

Related: [[arcana-diff-viewer-git-mode-default]] [[arcana-server-git-no-timeout]] [[arcana-repo-on-network-drive]] [[arcana-git-no-timeout]] [[arcana-stray-db-files]] [[verify-untracked-before-deletion]] [[arcana-verify-trash-untracked]] [[git-run-no-timeout]] [[network-drive-theory-wrong]] [[vcs-diff-hang-root-cause]]
