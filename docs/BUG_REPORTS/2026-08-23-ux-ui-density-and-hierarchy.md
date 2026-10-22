# Bug: UX/UI density and hierarchy findings

- Status: resolved 
- Date discovered: 2026-08-23
- Version/build: Wilderfolk v0.6.3 working tree
- Reporter: UX/UI screenshot review
- Area: UI
- Owner module: Sidebar presentation, selected-building inspector, Village tab
- Cadence: Render-time and player interaction

## Status history

- 2026-08-23 — open (identified from supplied 527×831 screenshot and implementation review)
- 2026-08-24 — partial — first pass implemented: tab buttons now carry `aria-label`/`aria-pressed` (UX-01), the Next Step CTA is visually dominant (UX-03), demolish moved to a collapsed “Advanced actions” section with an explicit two-step confirmation (UX-04), and the inspector collapse affordance already exists (UX-06). UX-02 inspector hierarchy, UX-05 metrics grouping, and UX-07 disclosure memory remain pending live review.
- 2026-08-24 — resolved — the developer accepted **UX-01..UX-07** as done for v0.6.3. Live narrow/desktop browser review and keyboard/focus review remain recommended before final release but do not block this closure.
- 2026-08-25 — re-verified: UX-02 (inspector header hierarchy), UX-05 (Village Population headline + Details disclosure), and UX-07 (CollapsibleSection disclosure-state memory with `storageKey`) are now actually implemented in code; no longer accepted-only.

## Observed behavior

The narrow-layout screenshot shows a dense right sidebar with six compressed navigation tabs, a selected-building inspector, a Village guidance card, population metrics, and additional sections. Several elements compete for attention, and the map loses substantial horizontal space. The selected-building panel presents the destructive demolish action with stronger visual emphasis than routine actions.

## Expected behavior

The interface should preserve map context while making the current object, current status, recommended next action, and destructive actions easy to distinguish. Navigation labels and important metrics should remain readable at narrow widths. No presentation change should create a second simulation owner.

## Reproduction steps

1. Open the game at a narrow viewport comparable to the supplied 527×831 screenshot.
2. Select a residence such as the Leader’s House.
3. Open the Village tab and inspect the selected-building panel, bottom navigation, Next Step card, and Population section.
4. Attempt to determine the recommended action, population constraint, and location of destructive actions without opening developer diagnostics.

## Evidence

- Supplied screenshot: `pasted_file_wYI0ve_image.png`.
- `docs/UX_UI_AUDIT_2026-08-23.md`.
- `src/components/SelectedBuildingPanel.tsx`.
- `src/components/tabPanels/VillageTabPanel.tsx`.
- `src/components/CollapsibleSection.tsx`.
- `src/game/FocusPanel.tsx`.
- `src/App.css`.

## Root cause

The shared sidebar primitives use fixed small typography and a six-column tab grid. The inspector and Village panel expose many valid facts but do not sufficiently separate primary status/action content from secondary diagnostics. Collapsible sections own local disclosure state, which reinforces a stack of independent cards rather than a single contextual hierarchy.

## Proposed changes and unique IDs

| ID | Proposal |
|---|---|
| UX-01 / `UX-2026-08-23-sidebar-density` | Make narrow navigation readable through icon-first tabs, accessible labels, or a secondary “More” group. |
| UX-02 / `UX-2026-08-23-inspector-hierarchy` | Establish identity, primary status/action, and secondary details as distinct visual levels. |
| UX-03 / `UX-2026-08-23-guidance-card-priority` | Make one Next Step action dominant; reduce Goals and extra tips to secondary controls. |
| UX-04 / `UX-2026-08-23-building-action-safety` | Put demolish in a lower-priority section and add explicit eviction confirmation. |
| UX-05 / `UX-2026-08-23-metrics-copy-density` | Group population metrics into capacity, warning/status, and secondary details with consistent terminology. |
| UX-06 / `UX-2026-08-23-responsive-sidebar-map-balance` | Add a narrow inspector mode with a clear collapse/return-to-map affordance. |
| UX-07 / `UX-2026-08-23-disclosure-state-memory` | Give disclosures stable presentation identity and optionally remember open state without persisting simulation state. |

## Fix

Not implemented. Recommendation-only audit; preserve the current UI as the fallback while the changes are reviewed.

## Regression test

Pending implementation. Required checks are narrow and desktop browser review, keyboard/focus review, readable tab labels, explicit demolish confirmation, and existing TypeScript/ESLint/test validation.

## Invariants checked

No simulation code was changed. Any implementation must preserve worker authority, typed command paths, save state, and existing simulation invariants.

## Save/migration impact

None proposed. Disclosure state must remain presentation-only and must not be added to world saves unless separately approved.

## Verification result

Audit complete; live browser and accessibility verification remain pending.

## Related commits or files

- `docs/UX_UI_AUDIT_2026-08-23.md`
- `src/components/SelectedBuildingPanel.tsx`
- `src/components/tabPanels/VillageTabPanel.tsx`
- `src/components/CollapsibleSection.tsx`
- `src/game/FocusPanel.tsx`
- `src/App.css`
