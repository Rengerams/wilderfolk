# Wilderfolk Building Art Audit

**Version context:** v0.6.3 Unreleased  
**Status:** Audit list only. No building artwork is being replaced by this document.

## Purpose

This list records which Wilderfolk building visuals deserve review or possible redesign. The audit is focused on visible consistency, scale, transparency, silhouette, isometric readability, and asset completeness. Building dimensions, collision footprints, production rules, staffing, upgrades, and simulation ownership remain unchanged unless a separate implementation task explicitly changes them.

The new crop-field image is treated as a visual reference for a possible future Farm redesign. It is not yet wired into the Farm and does not change Farm production or placement behavior.

## Priority list

| Priority | Building or asset | Current status | Why it deserves review | Recommended action |
|---|---|---|---|---|
| P0 | Farm | Existing sprite remains active | The current Farm does not yet express the larger agricultural identity suggested by the new crop-field reference. | Design a complete new Farm asset later, combining the building and nearby field language without changing the existing footprint first. |
| P0 | Garden, Statue, Lamp, Fence previews | Build-menu preview issue remains open | The menu has shown red-cross placeholders for decorative items even though decorations are cosmetic. | Provide real preview PNGs or connect the procedural preview renderer. Verify previews do not create simulation state. |
| P1 | Wall, Gate, Watchtower | New isometric assets integrated | These assets were normalized and palette-harmonized, but still need final in-game visual review at multiple zoom levels. | Keep the current integration; perform screenshot review before any further redesign. |
| P1 | House and Leader House | Existing assets | These are among the most frequently seen structures and set the scale and visual language for the settlement. | Review silhouette, roof readability, footprint alignment, and palette against the defense assets. |
| P1 | Tavern and Hotel | Existing assets | Social and visitor buildings are visually prominent and should feel like part of the same settlement rather than isolated props. | Review sign/readability, scale, entrances, and shared material palette. |
| P1 | Church and Barracks | Existing assets and gameplay-critical landmarks | These buildings carry important Moon Howler and defense meaning, so their silhouettes must be immediately readable. | Review the Church/Barracks visual relationship without changing their authoritative staffing or range rules. |
| P2 | Hospital and School | Existing assets | Care and education buildings need clear identity at normal map zoom. | Review color contrast, roofline, entrance, and readability beside residences. |
| P2 | Lumber Mill, Quarry, Mine, Workshop, Blacksmith | Existing production assets | The production group should share scale, material logic, and visual weight. | Audit as a single industrial set; redesign only obvious outliers. |
| P2 | Barn, Silo, Mill, Wood Storehouse | Existing support/storage assets | These assets occupy the food and storage family but may not yet read as one coherent agricultural/utility group. | Compare palette, roof shapes, and footprint proportions. Farm redesign should be considered alongside this group. |
| P2 | Well, Bridge, Fishing Spot, Wildlife Preserve | Existing utility/environment assets | These are smaller landmarks and can look inconsistent when viewed beside the larger buildings. | Review edge cleanup, shadow treatment, and map-scale readability. |
| P3 | Taming Post and other small utility props | Existing or procedural visuals | Small objects can become visual noise or look like placeholders when the camera is zoomed out. | Keep cosmetic; review only after the major building families are consistent. |
| P3 | Decorative objects | Procedural/cosmetic system | Decorations must remain beauty-only and must not interfere with simulation. | Solve preview presentation first, then assess whether any individual sprite needs replacement. |

## Review order

The recommended order is **Farm**, decorative previews, the residence/social group, the Church/Barracks landmarks, the industrial group, and then small utility props. This order follows player visibility and visual leverage rather than simulation importance.

The Farm should not be redesigned by merely placing the crop image over the current sprite. The preferred future pass is one coherent asset with a clear building center, field edge, transparent margins, and an unchanged logical footprint. The current Farm dimensions are approximately **53 × 46 world units**. Art may extend visually beyond that footprint only if the renderer keeps collision and placement bounds unchanged and the extension does not hide roads, trees, or adjacent buildings.

## Acceptance criteria for a rebuilt sprite

A replacement is ready only when it has a clean transparent background, a stable isometric or 2.5D silhouette, a readable footprint at normal gameplay zoom, consistent pixel edges, a palette compatible with neighboring buildings, and no accidental visual collision with roads, settlers, trees, or UI markers. The asset must be tested at near, normal, and far zoom.

The visual replacement must not alter the building’s authoritative type, dimensions, costs, construction time, staffing, production, upgrade path, or save behavior. If a visual requires a wider artboard, the renderer must continue using the existing logical footprint.

## Current non-goals

This audit does not authorize a full building-art replacement, a new crop simulation, a larger Farm placement reservation, automatic tree clearing around Farms, or a change to any worker or production rule. Those are separate decisions.

## Source references

- `src/game/buildings.ts` — authoritative building dimensions, costs, labels, sprites, and capacities.
- `src/game/renderer/buildings.ts` — in-world building rendering and sprite placement.
- `src/game/buildingActions.ts` — authoritative placement, footprint, overlap, and tree-clearing behavior.
- `docs/V0_6_3.md` — active visual asset and defense roadmap.
- `docs/BUILDING_PREVIEWS.md` — decorative preview work, if present.
- `public/sprites/` — current building and prop assets.
