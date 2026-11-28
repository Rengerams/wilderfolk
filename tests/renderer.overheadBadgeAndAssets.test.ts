/**
 * Guards the overhead status badge (shapes, not font glyphs) and the speech-bubble layout that must
 * clear the name plates.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { drawHumans, drawLeaderAuraOverlay } from '../src/game/renderer/humans';
import { resetEntityCaches, updateCachedEntities } from '../src/game/renderer/entityCache';
import { emptyEntityByType, EntityType } from '../src/game/gameTypes';
import { createEntity } from '../src/game/entityFactory';
import type { RenderSnapshot } from '../src/game/renderSnapshot';
import { getHumanStatusCombatIconFromFlags } from '../src/game/combat';
import {
  clampSpeechBubbleTailY,
  canPlaceNamePlate,
  combatTokenStatusKind,
  getStatusBadgeColor,
  getStatusBadgeLayout,
  getStatusBadgeShape,
  HUMAN_STATUS_KINDS,
  resolveStatusBadgeKind,
  resolveSpeechBubbleRect,
  type HumanStatusFacts,
  formatHumanNameLabel,
  type HumanNameLabelSubject,
} from '../src/game/renderer/overheadLayout';

const IDLE_FACTS: HumanStatusFacts = {
  isLeader: false,
  isMoonHowler: false,
  combatToken: null,
  faction: null,
  isJuvenile: false,
  schoolStatus: null,
  isPregnant: false,
  isCourting: false,
  isAtHome: false,
  isWorking: false,
  isMarried: false,
};

describe('status badge draws a shape, not a font glyph', () => {
  it('maps every status to a plain-ASCII shape and a colour', () => {
    for (const kind of HUMAN_STATUS_KINDS) {
      expect(getStatusBadgeShape(kind)).toMatch(/^[a-z]+$/);
      expect(getStatusBadgeColor(kind)).toMatch(/^#[0-9a-f]{6}$/);
    }
    // Distinct statuses must not collapse onto one silhouette.
    const shapes = new Set(HUMAN_STATUS_KINDS.map(getStatusBadgeShape));
    expect(shapes.size).toBe(HUMAN_STATUS_KINDS.length);
  });

  it('sizes the plate and its rim from the zoom, never from a font size', () => {
    const near = getStatusBadgeLayout(1.6);
    const far = getStatusBadgeLayout(0.8);
    expect(near.radius).toBeGreaterThan(far.radius);
    expect(near.rimWidth).toBeGreaterThanOrEqual(1);
    expect(Object.keys(near).sort()).toEqual(['radius', 'rimWidth']);
  });

  it('keeps the status the badge carried, in the same precedence, and never as an emoji', () => {
    expect(resolveStatusBadgeKind({ ...IDLE_FACTS, isLeader: true })).toBe('leader');
    // A cursed leader is still the leader: the aura outranks the curse, as the emoji did.
    expect(resolveStatusBadgeKind({ ...IDLE_FACTS, isLeader: true, isMoonHowler: true })).toBe('leader');
    expect(resolveStatusBadgeKind({ ...IDLE_FACTS, isMoonHowler: true })).toBe('cursed');
    expect(resolveStatusBadgeKind({ ...IDLE_FACTS, isPregnant: true, isMarried: true })).toBe('pregnant');
    expect(resolveStatusBadgeKind({ ...IDLE_FACTS, isAtHome: true, isWorking: true })).toBe('atHome');
    expect(resolveStatusBadgeKind({ ...IDLE_FACTS, isWorking: true, isMarried: true })).toBe('working');
    expect(resolveStatusBadgeKind(IDLE_FACTS)).toBe('idle');
    for (const kind of HUMAN_STATUS_KINDS) {
      expect(kind).toMatch(/^[a-zA-Z]+$/);
    }
  });

  it('translates every token the combat owner can publish', () => {
    const guard = getHumanStatusCombatIconFromFlags(
      { id: 1, job: 'soldier', workerBuildingId: 1 } as never,
      { barracksGuardKeys: new Set(['1:1']), hasShields: false, hasSpears: false },
    );
    const hunting = getHumanStatusCombatIconFromFlags(
      { huntTargetId: 2 } as never,
      { barracksGuardKeys: new Set(), hasShields: false, hasSpears: false },
    );
    const combat = getHumanStatusCombatIconFromFlags(
      { combatTicks: 3 } as never,
      { barracksGuardKeys: new Set(), hasShields: false, hasSpears: false },
    );
    const armed = getHumanStatusCombatIconFromFlags(
      {} as never,
      { barracksGuardKeys: new Set(), hasShields: true, hasSpears: false },
    );

    expect(combatTokenStatusKind(guard)).toBe('guard');
    expect(combatTokenStatusKind(hunting)).toBe('hunting');
    expect(combatTokenStatusKind(combat)).toBe('combat');
    expect(combatTokenStatusKind(armed)).toBe('armed');
    expect(combatTokenStatusKind(null)).toBeNull();
  });

  it('routes the badge through the drawn mark rather than the status emoji', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/game/renderer/humans.ts'), 'utf8');
    expect(source).not.toContain('getStatusIcon');
    expect(source).toContain('resolveStatusBadgeKind(');
    expect(source).toContain('drawStatusBadge(');
  });
});

describe('dense village name plate decluttering', () => {
  it.each([
    [44, 1.18, true], [45, 1.18, true], [89, 1.18, true],
    [90, 1.18, false], [90, 1.21, true], [90, 0.9, false], [90, 0.25, false],
  ] as const)('renders names for %i visible settlers at zoom %f', (count, zoom, ordinaryVisible) => {
    resetEntityCaches();
    try {
      const byType = emptyEntityByType();
      const humans = Array.from({ length: count }, (_, i) =>
        createEntity(EntityType.Human, 100 + (i % 10) * 160, 100 + Math.floor(i / 10) * 160,
          i + 1, 80, false, { name: 'Resident' + (i + 1) + 'X', ageYears: 30 }));
      byType[EntityType.Human] = humans;
      const camera = { x: 900, y: 900, zoom, targetX: 900, targetY: 900, targetZoom: zoom };
      const labels: string[] = [];
      const ctx = new Proxy({
        fillText: (value: string) => labels.push(value),
        measureText: (value: string) => ({ width: value.length * 5 }),
        createRadialGradient: () => ({ addColorStop: () => {} }),
      }, {
        get: (target, key) => Reflect.has(target, key) ? Reflect.get(target, key) : () => {},
      }) as unknown as CanvasRenderingContext2D;
      const state = {
        tick: 1, camera, buildings: [], unlockedTechs: [], hasBlacksmith: false,
        hourOfDay: 12, selectedEntityIds: [1], selectedEntity: humans[0],
        villageLeaderId: 2, worldMap: null, juiceEffectsEnabled: false,
      } as unknown as RenderSnapshot;
      updateCachedEntities(byType, null, 1, camera, 1800, 1800, 2400, 2400);
      drawHumans(ctx, state, 2400, 2400);
      expect(labels.some(label => label.includes('Resident1X'))).toBe(zoom > 0.45);
      expect(labels.some(label => label.includes('Resident2X'))).toBe(zoom > 0.28);
      expect(labels.some(label => label.includes('Resident3X'))).toBe(ordinaryVisible);
      // The unselected leader has exactly one crown (shadow and foreground), even below name zoom.
      expect(labels.filter(label => label === '👑')).toHaveLength(0);
      drawLeaderAuraOverlay(ctx, state, 2400, 2400);
      expect(labels.filter(label => label === '👑')).toHaveLength(2);
    } finally {
      resetEntityCaches();
    }
  });

  it('never paints a regular name on top of a reserved name', () => {
    const existing = { x: 20, y: 35, width: 70, height: 15 };
    expect(canPlaceNamePlate({ x: 50, y: 40, width: 50, height: 12 }, [existing])).toBe(false);
    expect(canPlaceNamePlate({ x: 95, y: 40, width: 50, height: 12 }, [existing])).toBe(true);
  });
});

describe('speech bubbles reserve the name plates', () => {
  // The name-plate zoom rule itself is asserted once in `renderer.presentationLayout`.
  it('lifts a bubble clear of the speaker own plate instead of covering the name', () => {
    const plate = { x: 100, y: 80, width: 70, height: 13 };
    const desired = { x: 96, y: 92, width: 80, height: 30 };
    expect(desired.y < plate.y + plate.height && desired.y + desired.height > plate.y).toBe(true);

    const placed = resolveSpeechBubbleRect(desired, [plate]);
    expect(placed.y + placed.height).toBeLessThanOrEqual(plate.y - 6);
  });

  it('clears a neighbour plate as well as another bubble', () => {
    const neighbourPlate = { x: 180, y: 60, width: 70, height: 13 };
    const otherBubble = { x: 100, y: 40, width: 90, height: 30 };
    const desired = { x: 176, y: 66, width: 80, height: 30 };

    const placed = resolveSpeechBubbleRect(desired, [otherBubble, neighbourPlate]);
    for (const reserved of [otherBubble, neighbourPlate]) {
      const overlaps = placed.x < reserved.x + reserved.width
        && placed.x + placed.width > reserved.x
        && placed.y < reserved.y + reserved.height
        && placed.y + placed.height > reserved.y;
      expect(overlaps).toBe(false);
    }
  });

  it('lays every plate out before the first bubble is placed', () => {
    const source = readFileSync(resolve(process.cwd(), 'src/game/renderer/humans.ts'), 'utf8');
    const bubblePush = source.indexOf('pendingBubbles.push({');
    const bubbleDraw = source.indexOf('for (const bubble of pendingBubbles)');
    const platePush = source.indexOf('occupiedBubbleRects.push(plate.rect);');

    expect(platePush).toBeGreaterThanOrEqual(0);
    expect(bubblePush).toBeGreaterThan(platePush);
    expect(bubbleDraw).toBeGreaterThan(bubblePush);
    // Exactly one bubble draw site, and it is the deferred one.
    expect(source.split('drawSpeechBubble(').length - 1).toBe(2);
  });

  it('stops a lifted bubble tail above the plate instead of slicing through its text', () => {
    // A bubble lifted above its speaker's plate: its bottom sits 6 px over the plate top.
    const plate = { x: 100, y: 200, width: 70, height: 13 };
    const bubbleBottom = plate.y - 6;
    const headTarget = 260;

    const tailY = clampSpeechBubbleTailY(bubbleBottom, headTarget, [plate]);
    expect(tailY).toBeLessThanOrEqual(plate.y - 3);
    expect(tailY).toBeGreaterThan(bubbleBottom);
  });

  it('leaves the tail alone when nothing reserved is in its path', () => {
    const plateAbove = { x: 100, y: 60, width: 70, height: 13 };
    expect(clampSpeechBubbleTailY(100, 260, [plateAbove])).toBe(260);
  });
});

function subject(overrides: Partial<HumanNameLabelSubject> = {}): HumanNameLabelSubject {
  return {
    id: 42,
    name: 'Ada',
    surname: null,
    title: null,
    faction: undefined,
    gender: 'female',
    isJuvenile: false,
    ...overrides,
  } as HumanNameLabelSubject;
}

const PLAIN = { isLeader: false, showRole: true, showId: true };

describe('F-RND-19 — the name plate states gender in text', () => {
  it('marks the plate differently for each gender', () => {
    const female = formatHumanNameLabel(subject({ gender: 'female' }), PLAIN);
    const male = formatHumanNameLabel(subject({ gender: 'male' }), PLAIN);
    expect(female).toContain('♀');
    expect(male).toContain('♂');
    expect(female).not.toBe(male);
  });

  it('keeps the plate it already showed — name, suffixes and the visitor/rival marks', () => {
    expect(formatHumanNameLabel(subject({ surname: 'Lovelace' }), PLAIN)).toContain('Ada Lovelace');
    expect(formatHumanNameLabel(subject(), { ...PLAIN, showId: false })).not.toContain('#42');
    expect(formatHumanNameLabel(subject(), PLAIN)).toContain('#42');
    expect(formatHumanNameLabel(subject({ faction: 'visitor' }), PLAIN)).toContain('↗');
    expect(formatHumanNameLabel(subject({ faction: 'rival' }), PLAIN)).toContain('⚑');
    expect(formatHumanNameLabel(subject({ isJuvenile: true }), PLAIN)).toContain('child');
    const leader = formatHumanNameLabel(subject({ name: undefined }), { ...PLAIN, isLeader: true });
    expect(leader).toContain('👑');
    expect(leader).toContain('Village head');
    expect(leader).toContain('Head');
  });
});
