# Wilderfolk UX/UI Audit — 2026-08-23

## Scope

This review covers the supplied 527×831 screenshot and the current sidebar implementation. It is a **presentation and interaction audit only**. No simulation ownership, worker authority, save state, or game rules should change as a result of these recommendations.

> Overall assessment: the UI is functional and visually coherent, but it is carrying too much information at once in a narrow viewport. The main problem is not the dark forest palette; it is hierarchy, density, and the cost of discovering what matters next.

## What the screenshot communicates

The map has a strong visual identity and the selected-building panel is clearly separated from the world. The green active Village tab is recognizable, and the “Build shelter” call to action is understandable. However, the right side reads as a stack of equally weighted cards rather than a guided decision surface. At this viewport, the player must parse the selected building, six navigation tabs, a village tutorial, population metrics, and additional collapsed sections simultaneously.

The screenshot also shows the map compressed into a narrow strip while the sidebar occupies most of the horizontal space. That may be appropriate for an inspector-first mode, but there is no obvious indication that the player is in such a mode, nor an easy visual distinction between information that requires immediate action and information that is merely available for inspection.

## Prioritized findings and proposed changes

Each proposal has a unique change number and a corresponding bug-report ID. These are recommendations for a later implementation pass; they are not claims that code has already been changed.

| Change | Bug report ID | Priority | Finding | Recommended change | Owner boundary | Reversible fallback |
|---|---|---:|---|---|---|---|
| UX-01 | `UX-2026-08-23-sidebar-density` | P0 | The six bottom tabs are compressed into very small labels at narrow width. “Hours Frontier Nature Progress Log” is difficult to scan and several labels visually run together. | At narrow widths, switch to icon-first tabs with tooltips/accessible labels, or group secondary tabs behind “More.” Keep Village, selected object, and one alert surface immediately available. | Sidebar presentation only. | Retain the current six-tab grid behind a viewport feature flag or CSS breakpoint fallback. |
| UX-02 | `UX-2026-08-23-inspector-hierarchy` | P0 | The selected-building inspector, navigation bar, and Village panel have nearly equal visual weight. The player cannot immediately distinguish identity, status, primary action, and optional diagnostics. | Establish a three-level inspector hierarchy: identity header, one primary status/action block, then collapsible detail sections. Give the selected building header a stronger title/icon row and reduce border competition between nested cards. | `SelectedBuildingPanel.tsx`, `CollapsibleSection.tsx`, sidebar layout. | Keep the existing component structure and default-open behavior; change only spacing, typography, and accent tokens first. |
| UX-03 | `UX-2026-08-23-guidance-card-priority` | P1 | “NEXT STEP” is useful, but “Goals →” and “+2 more tips” compete with the actual action. The card has a small heading, small body text, and a full-width CTA inside another card, so the action is not visually dominant enough. | Make one recommended action primary. Move Goals into a secondary link treatment and turn additional tips into a quieter disclosure row. Add a short state label such as “Recommended now” or “Blocked” when applicable. | `FocusPanel.tsx` and focus-hint presentation. | Preserve the current hint list and action callbacks; use a presentation-only variant that can be disabled. |
| UX-04 | `UX-2026-08-23-building-action-safety` | P1 | “Demolish (evicts residents)” is the strongest color on the panel and occupies the full width, but the consequence is embedded in a parenthesis rather than explained before commitment. The action is visually prominent even when it is not the player’s next task. | Separate destructive actions from routine actions, add a confirmation step with explicit consequences, and place demolish in a lower-priority “Advanced actions” disclosure. Keep the eviction warning adjacent to the confirm action. | `SelectedBuildingPanel.tsx` and the existing demolish command path; no simulation rule change. | Keep the current one-click path available behind a temporary accessibility/debug preference only if existing tests depend on it; default player flow should use confirmation. |
| UX-05 | `UX-2026-08-23-metrics-copy-density` | P1 | “Residents: 2 / 12,” beds, open slots, working, idle, jailed, children, adults, reputation, buildings, and techs are all presented with small text and mixed terminology. The player has to infer which number explains the immediate housing problem. | Use one headline capacity row, one warning/status row, and a “Details” disclosure. Prefer consistent terms such as “Residents,” “Beds,” “Open beds,” and “Population cap.” Move low-frequency diagnostics below the fold. | `VillageTabPanel.tsx` and stat-badge presentation. | Keep all metrics in the existing sections; change grouping and labels before removing any information. |
| UX-06 | `UX-2026-08-23-responsive-sidebar-map-balance` | P1 | At the captured width, the sidebar leaves little playable map area and the zoom control is visually detached from the panel. The player may lose spatial context while inspecting a building. | Add a narrow-layout inspector mode with a clearly visible collapse/toggle affordance, preserve the selected object, and provide a compact “return to map” action. Reposition or reduce zoom chrome when the inspector is expanded. | App shell/sidebar layout and map chrome only. | Keep the current fixed inspector layout as the desktop fallback and activate the new mode only below a measured breakpoint. |
| UX-07 | `UX-2026-08-23-disclosure-state-memory` | P2 | Every `CollapsibleSection` owns local open/closed state and subtitles disappear while open. This makes the sidebar feel dense and forces repeated rediscovery when moving between tabs or reselecting objects. | Add stable section identity and selectively remember open state per panel/tab. Keep only the most relevant section open by default for the current context; retain subtitles as compact status summaries where they help scanning. | `CollapsibleSection.tsx` plus the parent tab/inspector state owner. | Fall back to local state if persisted disclosure state is invalid or unavailable. Do not put simulation state in the disclosure model. |

## Highest-value first pass

The first implementation pass should be **UX-01, UX-02, UX-03, and UX-06**. Together they address the most visible failure: the narrow viewport does not clearly tell the player where to look, what to do, or how to recover map context. They can be implemented without changing the simulation model.

The second pass should address **UX-04 and UX-05**, because destructive-action safety and metric terminology affect player trust. UX-07 is useful polish, but it should follow the hierarchy changes so that remembered disclosure states do not preserve a poor information architecture.

## Acceptance tests

| Test | Pass condition |
|---|---|
| Narrow viewport | At the screenshot width, every primary navigation destination has a readable label or an accessible tooltip, and no tab labels visually collide. |
| Selected building | Within two seconds, a new player can identify the building, its current status, its primary useful action, and the location of destructive actions. |
| Guidance | The recommended next action is visually dominant over Goals and extra tips, and its blocked reason is visible without opening a diagnostic section. |
| Map context | Opening the inspector does not remove the player’s ability to return to the selected object or collapse the inspector. |
| Destruction safety | Demolishing a residence requires explicit acknowledgement of eviction consequences; normal actions remain one step. |
| Information density | The top of the Village tab presents population capacity and the most relevant warning before secondary diagnostics. |
| Simulation integrity | No proposed UI change writes world state directly; commands continue through the existing authoritative path. |
| Regression | TypeScript, ESLint, the existing test suite, and a short browser review at desktop and narrow widths pass. |

## Design constraints

The recommendations follow the existing project constraints: **WET, DRY, YAGNI, and separation of concerns**. The UI should not become a second simulation owner. Responsive behavior should be achieved through presentation state and existing callbacks, not by introducing a new tick layer, event bus, optimistic simulation state, or duplicate worker logic.

The screenshot is sufficient to identify hierarchy and density problems, but it cannot prove keyboard behavior, screen-reader semantics, touch target size, or the exact browser viewport dimensions. Those items require a live browser pass before implementation is marked accepted.

## Files reviewed

- `src/components/SelectedBuildingPanel.tsx`
- `src/components/tabPanels/VillageTabPanel.tsx`
- `src/components/CollapsibleSection.tsx`
- `src/game/FocusPanel.tsx`
- `src/App.css`
- Supplied screenshot: `pasted_file_wYI0ve_image.png`

## Status

**Audit complete; implementation not started.** The report is intentionally recommendation-only so the other active implementation work is not overwritten or duplicated.
