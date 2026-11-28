# AGENTS.md — Wilderfolk Engineering & PR Review Protocol

You are reviewing and maintaining the **entire Wilderfolk codebase**, not just isolated files in a diff. Evaluate changes for system-wide coherence, strict ownership boundaries, and long-term maintainability. Reject changes that optimize for a small diff at the expense of architectural consistency.

**Core Workflow:** Verify version & scope → audit ownership across the codebase → flag duplicate logic or shadow state → verify registries & tests → report concrete violations with file/line references.

> **Version Check:** Baseline package version is `0.6.5.1` (target: `0.6.5.2`). Always verify the actual version in the package manifest rather than trusting this header.

---

## 1. Non-Negotiable Engineering Rules

### Rule 1: One Behavior, One Implementation, One Owner
* **Requirement:** Every gameplay rule, calculation, selector, scheduler, validation, and pipeline must exist in exactly one authoritative place.
* **Flag as Violation:**
  * New helpers or utilities that duplicate existing logic under a different name.
  * Parallel implementations created to avoid modifying an existing module.
  * Copy-pasted logic across systems.
* **Required Fix:** Reuse the existing owner. If the existing owner is insufficient, upgrade or generalize it in its authoritative module and migrate all callers.

### Rule 2: Search by Responsibility Before Creating Code
* **Requirement:** Any new function or module must be justified against existing capabilities in `OWNERSHIP_OVERVIEW.md` and related domain modules.
* **Flag as Violation:**
  * Adding a new function when a utility performing the same responsibility already exists in `OWNERSHIP_OVERVIEW.md` or nearby domain files.

### Rule 3: Strict Ownership Hierarchy (Decide → Invoke → Observe)
* **Requirement:**
  * **Owners** make gameplay decisions and mutate authoritative state.
  * **Callers** invoke owners through public interfaces.
  * **UI and Diagnostics** strictly observe state; they never mutate gameplay state or compute independent gameplay rules.
* **Flag as Violation:**
  * UI components or diagnostic tools mutating gameplay state directly.
  * Secondary decision authorities, contradictory policies, or shadow state caches that can drift from the primary owner.

### Rule 4: Function & Symbol Registration
* **Requirement:** Every added, moved, renamed, modified, or removed named function must be properly registered in the project's function/ownership registry (e.g., `OWNERSHIP_OVERVIEW.md` or designated manifest). *(Note: Complete this rule with your exact registry file path if applicable.)*
* **Flag as Violation:**
  * Public or named functions introduced, renamed, or deleted in a PR without corresponding updates to the registry.

---

## 2. Automated PR Review Checklist (For Codex)

When reviewing a Pull Request, inspect both the diff and the surrounding codebase, then check every item below:

1. **Duplicate Responsibility Check:** Do any newly added functions, selectors, or validators replicate behavior already owned elsewhere in the repo?
2. **Ownership Boundary Check:** Are state mutations and gameplay decisions restricted strictly to their single authoritative owner? Does any UI/diagnostic code contain business logic or state mutation?
3. **Caller Migration Check:** If an existing function's behavior was changed or generalized, were all existing callers across the entire repository updated accordingly?
4. **Registry Sync Check:** Are all added, renamed, moved, or removed named functions reflected in `OWNERSHIP_OVERVIEW.md` (and any required registries)?
5. **Version & Scope Accuracy:** Does the change align with the current package version in the repo, and does it completely solve the root problem rather than patching symptoms?

---

## 3. Review Output Format

Report findings clearly using the following structure:
* **Status:** `PASS` or `CHANGES REQUESTED`
* **Violations:** List each rule violation with `[Rule #]`, exact `file:line`, what duplicates or violates ownership, and the specific existing owner/module to use instead.
* **Warnings / Verification:** Note any missing test coverage for modified owners or unverified caller migrations.
