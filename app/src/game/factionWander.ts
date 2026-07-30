/**
 * Camp wander / visitor village activities.
 * Visitors no longer only orbit their tent — they visit POIs by kind.
 */
import type { WorldState, Entity, Building, VisitorKind, VisitorGroup } from './gameTypes';
import { BuildingType } from './gameTypes';
import { getPlayerCampCenter } from './frontierCombat';
import { TICKS_PER_DAY, getHourOfDay, isNightHour } from './dayCycle';

type VisitPhase = 'idle_camp' | 'walk_poi' | 'loiter_poi' | 'return_camp' | 'wander_edge';

interface WanderState {
  targetX: number;
  targetY: number;
  idleUntilTick: number;
  phase: VisitPhase;
  /** Optional chat / flavor when arriving at a POI */
  poiLabel?: string;
}

const wanderByEntity = new Map<number, WanderState>();

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function jitter(n: number, amount: number): number {
  return n + (Math.random() - 0.5) * amount;
}

function completedPlayerBuildings(buildings: Building[]): Building[] {
  return buildings.filter((b) => b.completed && b.faction !== 'rival');
}

function buildingCenter(b: Building): { x: number; y: number } {
  return { x: b.x + b.width / 2, y: b.y + b.height * 0.85 };
}

function findBuilding(
  buildings: Building[],
  types: BuildingType[],
): Building | undefined {
  const pool = completedPlayerBuildings(buildings).filter((b) => types.includes(b.type));
  if (pool.length === 0) return undefined;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Preferred village destinations by visitor kind. */
function pickPoiForKind(
  state: WorldState,
  kind: VisitorKind,
  buildings: Building[],
): { x: number; y: number; label: string } | null {
  const village = getPlayerCampCenter(state, buildings);

  const tryTypes = (types: BuildingType[], label: string) => {
    const b = findBuilding(buildings, types);
    if (!b) return null;
    const c = buildingCenter(b);
    return { x: jitter(c.x, 18), y: jitter(c.y, 14), label };
  };

  switch (kind) {
    case 'traders': {
      return (
        tryTypes([BuildingType.Hotel, BuildingType.Market, BuildingType.Store], 'market')
        ?? tryTypes([BuildingType.TownHall, BuildingType.Workshop], 'hall')
        ?? { x: jitter(village.x, 40), y: jitter(village.y, 40), label: 'square' }
      );
    }
    case 'pilgrims': {
      return (
        tryTypes([BuildingType.Church], 'church')
        ?? tryTypes([BuildingType.TownHall], 'hall')
        ?? tryTypes([BuildingType.Well], 'well')
        ?? { x: jitter(village.x, 28), y: jitter(village.y, 28), label: 'shrine' }
      );
    }
    case 'scholars': {
      return (
        tryTypes([BuildingType.School, BuildingType.TownHall], 'study')
        ?? tryTypes([BuildingType.Church, BuildingType.Market], 'library')
        ?? { x: jitter(village.x, 36), y: jitter(village.y, 36), label: 'notes' }
      );
    }
    case 'hunters': {
      // Edge of village / hunting grounds, not always the same building
      if (Math.random() < 0.45) {
        const spot = findBuilding(buildings, [BuildingType.HuntingSpot, BuildingType.TamingPost]);
        if (spot) {
          const c = buildingCenter(spot);
          return { x: jitter(c.x, 22), y: jitter(c.y, 22), label: 'hunt' };
        }
      }
      const angle = Math.random() * Math.PI * 2;
      const r = 90 + Math.random() * 70;
      return {
        x: clamp(village.x + Math.cos(angle) * r, 20, state.width - 20),
        y: clamp(village.y + Math.sin(angle) * r, 20, state.height - 20),
        label: 'trail',
      };
    }
    case 'nomads': {
      return (
        tryTypes([BuildingType.Hotel, BuildingType.Tavern, BuildingType.Market, BuildingType.Well], 'campfire')
        ?? tryTypes([BuildingType.House, BuildingType.Mansion], 'homes')
        ?? { x: jitter(village.x, 50), y: jitter(village.y, 50), label: 'road' }
      );
    }
    case 'refugees': {
      return (
        tryTypes([BuildingType.TownHall, BuildingType.Hospital], 'help')
        ?? tryTypes([BuildingType.Church, BuildingType.Well], 'shelter')
        ?? { x: jitter(village.x, 24), y: jitter(village.y, 24), label: 'plea' }
      );
    }
    case 'performers': {
      return (
        tryTypes([BuildingType.Tavern, BuildingType.Market, BuildingType.TownHall], 'stage')
        ?? { x: jitter(village.x, 30), y: jitter(village.y, 30), label: 'show' }
      );
    }
    default:
      return { x: jitter(village.x, 40), y: jitter(village.y, 40), label: 'visit' };
  }
}

function campLoiter(campX: number, campY: number, radius = 28): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const r = 6 + Math.random() * radius;
  return { x: campX + Math.cos(angle) * r, y: campY + Math.sin(angle) * r };
}

function shouldLeaveCamp(
  kind: VisitorKind,
  hour: number,
  entityId: number,
  tick: number,
): boolean {
  // Night: mostly at camp (performers / traders still sometimes stay in the square)
  if (isNightHour(hour)) {
    if (kind === 'performers' && hour >= 18 && hour < 22) return Math.random() < 0.55;
    if (kind === 'traders' && hour >= 19 && hour < 21) return Math.random() < 0.2;
    return Math.random() < 0.08;
  }
  // Daytime by kind
  const base: Record<VisitorKind, number> = {
    traders: 0.72,
    pilgrims: 0.65,
    scholars: 0.6,
    hunters: 0.7,
    nomads: 0.68,
    refugees: 0.45,
    performers: 0.75,
  };
  // Stable-ish daily mood so a group doesn't all flip every tick
  const salt = ((entityId * 17 + Math.floor(tick / TICKS_PER_DAY) * 31) % 100) / 100;
  return salt < base[kind] + (Math.random() - 0.5) * 0.15;
}

function idleTicksFor(phase: VisitPhase, kind: VisitorKind): number {
  const day = TICKS_PER_DAY;
  switch (phase) {
    case 'idle_camp':
      return Math.floor(day * (0.06 + Math.random() * 0.18));
    case 'loiter_poi':
      if (kind === 'performers') return Math.floor(day * (0.2 + Math.random() * 0.35));
      if (kind === 'traders') return Math.floor(day * (0.12 + Math.random() * 0.25));
      if (kind === 'pilgrims') return Math.floor(day * (0.15 + Math.random() * 0.3));
      return Math.floor(day * (0.1 + Math.random() * 0.22));
    case 'return_camp':
      return Math.floor(day * 0.04);
    default:
      return Math.floor(day * 0.05);
  }
}

function nextVisitorActivity(
  state: WorldState,
  entity: Entity,
  group: VisitorGroup,
  campX: number,
  campY: number,
  buildings: Building[],
  prev: WanderState | null,
): WanderState {
  const hour = getHourOfDay(state.tick);
  const kind = group.kind;

  // Night return bias
  if (isNightHour(hour) && Math.random() < 0.7 && kind !== 'performers') {
    const t = campLoiter(campX, campY, 22);
    return {
      phase: 'return_camp',
      targetX: t.x,
      targetY: t.y,
      idleUntilTick: state.tick,
      poiLabel: 'camp',
    };
  }

  // After loitering at POI, often go home to camp or pick another POI
  if (prev?.phase === 'loiter_poi') {
    if (Math.random() < 0.55) {
      const t = campLoiter(campX, campY);
      return {
        phase: 'return_camp',
        targetX: t.x,
        targetY: t.y,
        idleUntilTick: state.tick,
        poiLabel: 'camp',
      };
    }
  }

  if (shouldLeaveCamp(kind, hour, entity.id, state.tick)) {
    const poi = pickPoiForKind(state, kind, buildings);
    if (poi) {
      return {
        phase: 'walk_poi',
        targetX: clamp(poi.x, 12, state.width - 12),
        targetY: clamp(poi.y, 12, state.height - 12),
        idleUntilTick: state.tick,
        poiLabel: poi.label,
      };
    }
  }

  // Stay near camp — slightly larger ring, occasional "chores"
  const t = campLoiter(campX, campY, kind === 'refugees' ? 18 : 36);
  return {
    phase: 'idle_camp',
    targetX: t.x,
    targetY: t.y,
    idleUntilTick: state.tick + idleTicksFor('idle_camp', kind),
    poiLabel: 'camp',
  };
}

function pickRivalWander(
  campX: number,
  campY: number,
): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const radius = 10 + Math.random() * 38;
  return {
    x: campX + Math.cos(angle) * radius,
    y: campY + Math.sin(angle) * radius,
  };
}

function ensureWanderState(
  state: WorldState,
  entity: Entity,
  campX: number,
  campY: number,
  buildings: Building[],
): WanderState {
  let wander = wanderByEntity.get(entity.id);
  if (!wander) {
    if (entity.faction === 'visitor') {
      const group = state.visitorGroups.find((g) => g.id === entity.groupId);
      if (group) {
        wander = nextVisitorActivity(state, entity, group, campX, campY, buildings, null);
        wanderByEntity.set(entity.id, wander);
        return wander;
      }
    }
    const t = pickRivalWander(campX, campY);
    wander = {
      phase: 'idle_camp',
      targetX: t.x,
      targetY: t.y,
      idleUntilTick: state.tick + Math.floor(Math.random() * TICKS_PER_DAY * 0.15),
    };
    wanderByEntity.set(entity.id, wander);
  }
  return wander;
}

/** Tiny flavor when a visitor arrives at a village point of interest. */
function maybeArriveFlavor(entity: Entity, phase: VisitPhase, label?: string): void {
  if (phase !== 'loiter_poi' || !label) return;
  if (Math.random() > 0.35) return;
  // Soft one-shot bubble via chat system if present
  const lines: Record<string, string[]> = {
    market: ['Fine goods?', 'What is the price?', 'We bring cloth.', 'Trade?'],
    hall: ['Is the elder here?', 'We seek audience.', 'Greetings, village.'],
    church: ['Bless this place.', 'We light a candle.', 'Peace upon you.'],
    study: ['May we read?', 'Curious craft…', 'Share a map?'],
    hunt: ['Tracks nearby.', 'Good hunting ground.', 'Deer that way.'],
    trail: ['Quiet woods.', 'Keep watch.', 'Smell of game.'],
    campfire: ['Warm hearth?', 'Stories for bread?', 'Long road.'],
    homes: ['Strong walls.', 'Children laugh here.', 'Fine houses.'],
    help: ['We need shelter…', 'Any work for food?', 'Please, the cold…'],
    shelter: ['Water, please.', 'A moment of rest.', 'Kind strangers?'],
    stage: ['A song for coin!', 'Gather round!', 'Dance with us!'],
    show: ['Ta-da!', 'Encore?', 'Music!'],
    square: ['Busy square.', 'Hello!', 'Nice village.'],
    well: ['Fresh water.', 'A drink first.', 'Ah…'],
    shrine: ['We pray.', 'Sacred quiet.', 'Amen.'],
    notes: ['Interesting…', 'Write that down.', 'Hmm.'],
    visit: ['Hello there.', 'Fine day.', 'Pardon us.'],
    road: ['Dusty boots.', 'Which way?', 'Onward.'],
    plea: ['Mercy…', 'We fled fire.', 'Any room?'],
    camp: [],
  };
  const pool = lines[label] ?? lines.visit;
  if (!pool.length) return;
  const phrase = pool[Math.floor(Math.random() * pool.length)];
  entity.chatPhrase = phrase;
  entity.chatTicks = 18 + Math.floor(Math.random() * 10);
}

export function tickFactionCampWander(
  state: WorldState,
  entity: Entity,
  campX: number,
  campY: number,
  buildings: Building[],
  moveSpeed: number,
): void {
  const wander = ensureWanderState(state, entity, campX, campY, buildings);
  const visitorGroup = entity.faction === 'visitor'
    ? state.visitorGroups.find((g) => g.id === entity.groupId)
    : null;

  // Performers loitering: small "dance" bob — stay put but face around
  if (
    visitorGroup?.kind === 'performers'
    && wander.phase === 'loiter_poi'
    && state.tick < wander.idleUntilTick
  ) {
    entity.vx = 0;
    entity.vy = 0;
    if (state.tick % 6 === 0) {
      entity.spriteAngle = (entity.spriteAngle ?? 0) + 0.7;
    }
    if (state.tick % 20 === 0 && Math.random() < 0.4) {
      entity.chatPhrase = ['♪ La la~', 'Clap along!', 'A tune!', 'Bravo?'][Math.floor(Math.random() * 4)];
      entity.chatTicks = 14;
    }
    return;
  }

  if (state.tick < wander.idleUntilTick) {
    entity.vx = 0;
    entity.vy = 0;
    return;
  }

  const dx = wander.targetX - entity.x;
  const dy = wander.targetY - entity.y;
  const dist = Math.hypot(dx, dy);
  const arrive = wander.phase === 'walk_poi' || wander.phase === 'return_camp' ? 12 : 10;

  if (dist < arrive) {
    // Arrived
    if (wander.phase === 'walk_poi') {
      wander.phase = 'loiter_poi';
      wander.idleUntilTick = state.tick + idleTicksFor(
        'loiter_poi',
        visitorGroup?.kind ?? 'nomads',
      );
      maybeArriveFlavor(entity, 'loiter_poi', wander.poiLabel);
      entity.vx = 0;
      entity.vy = 0;
      return;
    }

    if (wander.phase === 'return_camp') {
      wander.phase = 'idle_camp';
      wander.idleUntilTick = state.tick + idleTicksFor('idle_camp', visitorGroup?.kind ?? 'nomads');
      entity.vx = 0;
      entity.vy = 0;
      return;
    }

    // Pick next activity
    if (visitorGroup) {
      const next = nextVisitorActivity(
        state,
        entity,
        visitorGroup,
        campX,
        campY,
        buildings,
        wander,
      );
      wander.phase = next.phase;
      wander.targetX = next.targetX;
      wander.targetY = next.targetY;
      wander.idleUntilTick = next.idleUntilTick;
      wander.poiLabel = next.poiLabel;
    } else {
      const t = pickRivalWander(campX, campY);
      wander.targetX = t.x;
      wander.targetY = t.y;
      wander.phase = 'idle_camp';
      wander.idleUntilTick = state.tick + Math.floor(TICKS_PER_DAY * (0.08 + Math.random() * 0.35));
    }
    entity.vx = 0;
    entity.vy = 0;
    return;
  }

  // Slightly faster when heading into the village for a purpose
  const rush =
    wander.phase === 'walk_poi' ? 1.15
      : wander.phase === 'return_camp' ? 1.05
        : 1;
  entity.vx = (dx / dist) * moveSpeed * rush;
  entity.vy = (dy / dist) * moveSpeed * rush;
  entity.x += entity.vx;
  entity.y += entity.vy;
  entity.spriteAngle = Math.atan2(entity.vy, entity.vx);
}

export function clearFactionWanderState(entityId: number): void {
  wanderByEntity.delete(entityId);
}

/** Reset all wander AI — call on new game, load, or session reset. */
export function clearAllFactionWanderStates(): void {
  wanderByEntity.clear();
}

/** Drop wander AI for entities that are no longer alive. */
export function pruneFactionWanderStates(livingEntityIds: Iterable<number>): void {
  const living = new Set(livingEntityIds);
  for (const id of wanderByEntity.keys()) {
    if (!living.has(id)) wanderByEntity.delete(id);
  }
}
