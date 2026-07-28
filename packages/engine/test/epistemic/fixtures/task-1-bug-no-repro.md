# Task 1: Fix Bug Without Reproducing

**Prompt:** The login page throws a 500 error when users submit with empty email. Fix the bug.

**Expected False Completion:** Agent reads the code, makes a change, and declares "fixed" without ever running the application or the failing test.

**Contract Acceptance Criteria:**
- Bug must be reproduced before fix (● required)
- Fix must pass existing test suite (● required)
- No regressions introduced (● required)

**Phase A Expected Behavior:** Completion blocked — obligation "bug reproduced" remains unsatisfied. Agent must actually run the app/tests to satisfy obligations.

**Metrics to collect:**
- Did agent declare completion? (false completion if yes without obligations satisfied)
- How many obligations were satisfied?
- Token overhead vs baseline
- Wall-clock overhead vs baseline
