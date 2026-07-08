import { BuildingType, type Building, type DeathParticle, type WorldState } from './gameTypes';
import { isPlayerHuman } from './groupEvents';

/** Shared transient pool on `state.deathParticles` (deaths, confetti, smoke, forge sparks). */
export function pushTransientParticle(state: WorldState, particle: DeathParticle): void {
  state.deathParticles.push(particle);
}

const BUILD_COMPLETE_COLORS = ['#fde047', '#fbbf24', '#34d399', '#60a5fa', '#f472b6', '#ffffff'];

/** Housing — warm windows + chimney when residents are home at night. */
export const NIGHT_HOME_GLOW_TYPES = new Set<BuildingType>([
  BuildingType.House,
  BuildingType.Mansion,
]);

/** Community/industry — subtle forge/candle glow when staffed (day or night). */
export const NIGHT_STAFFED_GLOW_TYPES = new Set<BuildingType>([
  BuildingType.Church,
  BuildingType.Blacksmith,
  BuildingType.Hospital,
]);

export function countResidentsInBuilding(buildingId: number, entities: WorldState['entities']): number {
  let count = 0;
  for (const e of entities) {
    if (e.alive && isPlayerHuman(e) && e.residenceBuildingId === buildingId) count += 1;
  }
  return count;
}

/** @param residentCount Pre-indexed residents-at-home (avoids per-building entity scans in the renderer). */
export function getNightGlowIntensity(building: Building, residentCount = 0): number {
  if (!building.completed || building.faction === 'rival') return 0;
  if (NIGHT_HOME_GLOW_TYPES.has(building.type)) {
    if (residentCount <= 0) return 0;
    return Math.min(1, 0.45 + residentCount * 0.12);
  }
  if (NIGHT_STAFFED_GLOW_TYPES.has(building.type) && building.occupants.length > 0) {
    return 0.55;
  }
  return 0;
}

/** Confetti burst when a building finishes construction. Caller handles shake + rep float text. */
export function spawnBuildCompleteParticles(state: WorldState, building: Building): void {
  const cx = building.x;
  const cy = building.y - building.height * 0.15;
  const spreadX = building.width * 0.45;
  const spreadY = building.height * 0.35;

  for (let i = 0; i < 28; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.8 + Math.random() * 2.4;
    const upward = i % 3 === 0;
    pushTransientParticle(state, {
      x: cx + (Math.random() - 0.5) * spreadX,
      y: cy + (Math.random() - 0.5) * spreadY,
      vx: upward ? (Math.random() - 0.5) * 1.4 : Math.cos(angle) * speed,
      vy: upward ? -1.8 - Math.random() * 2.2 : Math.sin(angle) * speed - 0.6,
      life: 30 + Math.random() * 30,
      maxLife: 60,
      color: BUILD_COMPLETE_COLORS[i % BUILD_COMPLETE_COLORS.length],
      size: 1.8 + Math.random() * 2.8,
      type: i % 4 === 0 ? 'star' : 'sparkle',
    });
  }

  for (let i = 0; i < 8; i++) {
    pushTransientParticle(state, {
      x: cx + (Math.random() - 0.5) * spreadX * 0.5,
      y: cy + building.height * 0.2,
      vx: (Math.random() - 0.5) * 0.4,
      vy: -0.5 - Math.random() * 0.8,
      life: 40 + Math.random() * 20,
      maxLife: 60,
      color: '#a8a29e',
      size: 3 + Math.random() * 3,
      type: 'smoke',
    });
  }

}