# Wilderfolk — Bug report protocol

This is the **required instruction file for new bug reports** in the current Wilderfolk development cycle. New reports belong in `docs/bug_report/`. The historical archive `docs/BUG_REPORTS/` remains unchanged; **do not copy or duplicate archived reports**. The single index remains `docs/BUG_REPORTS/SUMMARY.md` until an explicitly approved tracker migration. Every newly reported issue must also receive one entry there, linking to `../bug_report/<filename>.md`. Never create a second summary or re-export index.

## Required workflow for coding agents

1. When a defect is discovered while implementing any feature, check `docs/bug_report/`, `docs/BUG_REPORTS/`, and `docs/BUG_REPORTS/SUMMARY.md` for an existing report. **Update the existing report/index if the defect is already known; never create duplicates.**
2. Reproduce the failure with a focused test, simulation or evidence-backed code trace. If it cannot be reproduced, mark that explicitly and preserve the available facts. Never invent a test result or claim a fix without evidence.
3. Create `docs/bug_report/YYYY-MM-DD-short-kebab-case-title.md` for each *new distinct* bug and add one matching summary entry to the single existing tracker. Report defects even when fixing them in the same PR; use an accurate status.
4. Describe severity and user impact, observed vs expected behavior, deterministic reproduction steps, root cause (or **unknown**), source owner, proposed/actual fix, regression coverage, save compatibility and verification result. Link the relevant PR/commit if available.
5. Use **open**, **investigating**, **resolved** or **blocked** as honest statuses and record dated changes under `Status history`. A fix that has not been tested is not verified; never disguise incomplete verification.
6. Fix in the scope of the assigned owner and task. If unrelated or too extensive, leave the bug as **open** or **blocked** and report the blocker without making speculative changes. Do not mutate code or skip tests merely to close the report.
7. The feature roadmap is an implementation register, **not a bug tracker or test checklist**. Do not add bug-verification work as roadmap features.

## New report template

```markdown
# Short, specific defect title

- Bug: one-sentence failure
- Status: open
- Severity: critical | high | medium | low
- Date discovered: YYYY-MM-DD
- Version/build: actual inspected build
- Reporter: source of observation
- Area: affected subsystem
- Owner module: verified sole owner, or unknown
- Related PR/commit: if available

## Status history
- YYYY-MM-DD — open: short evidence-based note

## Observed behavior
Exact symptom and conditions; include reproducible measurements when available.

## Expected behavior
What the existing rules, tests or player-visible contract require.

## Reproduction steps
1. Actual starting state/seed/save.
2. Real action/test command and relevant conditions.
3. Observable failure/assertion.

## Evidence
Trace, test output, log, actual source symbol and/or save evidence.

## Root cause
Verified explanation or "not yet established".

## Fix / proposed fix
Minimal proposed or committed change, preserving single ownership.

## Save/migration impact
Explicit "none" or concrete compatibility details.

## Verification result
Exact commands and results; distinguish PASS, FAIL and NOT RUN.
```

## Required architecture and reporting

When the bug results in code changes, update **both** `OWNERSHIP_OVERVIEW.md` and `src/game/simulation/decisionRegistry.ts` in the same implementation PR. Every relevant function belongs to exactly one module, each decision has its actual cadence, caller and write set, and pure read-only projections have `writes: []`.

Follow `AGENTS.md`, `docs/command.md`, and the ownership/decision registries if the bug spans multiple feature modules. New reports use this file as their instructions; older `docs/BUG_REPORTS/` documents are kept as historical evidence and example reports.
