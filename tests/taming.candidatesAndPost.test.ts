/**
 * F16 and F17 — the taming panel listed the wrong settlers, and measured the post's reach its own way
 * (`docs/private/audits/2026-09-16/ui-logic.md`, tracked in `LIVE-FINDINGS-STATUS.md`).
 *
 * **F16:** the list was every adult human in `state.entities`, which includes `faction: 'visitor'` and
 * `'rival'` humans, while the command refuses those silently (`isPlayerHuman`) — so picking a visitor's
 * name did nothing at all, ever, and the four-slot cap let foreign adults crowd out eligible settlers.
 * **F17:** the panel measured from the footprint **corner** (`b.x`) and the command from its **centre**
 * (`b.x + width/2`), and only the panel accepted a rival-owned post. Both now come from the owner.
 *
 * Note for whoever reads this next: the two circles disagree because the repo carries two conventions for
 * `building.x/y` (the renderer and `isEntityOnBuilding` treat it as the corner; `isFootprintOnBuildable
 * Terrain` treats it as the centre). This file pins *agreement*, not which convention is correct — that
 * question is recorded in the tracker's "Other" table, because answering it would re-place every building.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BuildingType, EntityType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { initGame, createEntity } from '../src/game/worldGen';
import {
  getTameEntityEligibility,
  hasNearbyPlayerTamingPost,
  listTamingCandidates,
} from '../src/game/settlerInteractionActions';

const FIXTURE_SEED = 20_260_917;
/** Footprint centre is (120, 100) for this post, which is the point the reach test measures from. */
const POST = { x: 100, y: 100, width: 40, height: 40 };

function world(): WorldState {
  return initGame({ seed: FIXTURE_SEED });
}

function addPost(state: WorldState, faction: 'player' | 'rival' = 'player'): void {
  state.buildings.push({
    id: 9001,
    type: BuildingType.TamingPost,
    x: POST.x,
    y: POST.y,
    width: POST.width,
    height: POST.height,
    occupants: [],
    level: 1,
    constructionProgress: 100,
    completed: true,
    health: 100,
    maxHealth: 100,
    spriteScale: 1,
    buildAnimTimer: 0,
    faction,
  } as never);
}

function addHuman(state: WorldState, faction: Entity['faction'], juvenile = false): Entity {
  const human = createEntity(EntityType.Human, 300, 300, state.nextEntityId++, 300, juvenile);
  human.faction = faction;
  human.age = 25;
  state.entities.push(human);
  state.humanPopulation++;
  return human;
}

function creatureAt(state: WorldState, x: number, y: number): Entity {
  const creature = createEntity(EntityType.Rabbit, x, y, state.nextEntityId++, 300);
  state.entities.push(creature);
  return creature;
}

describe('taming candidates and post reach', () => {
  it('offers settlers only — never a visitor, a rival or a child', () => {
    const state = world();
    const visitor = addHuman(state, 'visitor');
    const rival = addHuman(state, 'rival');
    const child = addHuman(state, undefined, true);

    const offered = listTamingCandidates(state).map((human) => human.id);
    expect(offered).not.toContain(visitor.id);
    expect(offered).not.toContain(rival.id);
    expect(offered).not.toContain(child.id);
    expect(offered.length, 'fixture premise: the colony has adult settlers').toBeGreaterThan(0);

    // The pre-fix filter, verbatim from the panel — so this guard cannot be vacuous: it *did* offer the
    // visitor, which is the button that could never do anything (F16).
    const preFixFilter = state.entities
      .filter((e) => e.type === EntityType.Human && e.alive && !e.isJuvenile)
      .map((human) => human.id);
    expect(preFixFilter).toContain(visitor.id);
  });

  it('refuses a foreign tamer through the owner, which is why the panel must not list them', () => {
    const state = world();
    addPost(state);
    const visitor = addHuman(state, 'visitor');
    const rabbit = creatureAt(state, 100, 100);

    expect(getTameEntityEligibility(state, rabbit.id, visitor.id).ok).toBe(false);
  });

  it('measures reach from the footprint centre — the point the post is drawn at', () => {
    const state = world();
    addPost(state);
    // `building.x/y` is the centre: the pad and sprite are drawn from `x - w/2`, and the bounds/terrain/
    // overlap checks all use `x ± w/2`. 130 px out is therefore in reach and 150 px is not.
    expect(hasNearbyPlayerTamingPost(state, creatureAt(state, 230, 100))).toBe(true);
    expect(hasNearbyPlayerTamingPost(state, creatureAt(state, 250, 100))).toBe(false);

    // The two pre-fix rules, verbatim, evaluated at the creature 250 px out — so the guard cannot be
    // vacuous: the *owner* reached it (its circle sat half a footprint to the right) while the panel's
    // plain `b.x` correctly did not. That is F17's disagreement, in the direction the audit stated.
    const preFixOwnerReach = Math.hypot(POST.x + POST.width / 2 - 250, POST.y + POST.height / 2 - 100) < 140;
    const preFixPanelReach = Math.hypot(POST.x - 250, POST.y - 100) < 140;
    expect(preFixOwnerReach, 'the pre-fix owner circle disagreed here').toBe(true);
    expect(preFixPanelReach, 'the pre-fix panel circle matched the centre').toBe(false);

    const rivalState = world();
    addPost(rivalState, 'rival');
    expect(
      hasNearbyPlayerTamingPost(rivalState, creatureAt(rivalState, 110, 100)),
      'a rival-owned post is not the player\'s',
    ).toBe(false);
  });

  it('keeps the panel on the owner for both', () => {
    const panel = readFileSync(resolve(process.cwd(), 'src/components/SelectedEntityPanel.tsx'), 'utf8');
    expect(panel).toContain('listTamingCandidates(state)');
    expect(panel).toContain('hasNearbyPlayerTamingPost(state, entity)');
    expect(panel, 'the panel restates the reach test again').not.toMatch(/TamingPost && Math\.hypot/);
  });
});
