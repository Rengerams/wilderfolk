/**
 * Building vocabulary + catalog. Leaf module — imports only sibling leaf types
 * (no gameTypes) so the barrel can re-export it without cycles.
 */
import type { HuntingSpotPrey } from './huntingSpots';

export const BuildingType = {
  House: 'house',
  Farm: 'farm',
  Greenhouse: 'greenhouse',
  Barn: 'barn',
  Silo: 'silo',
  LumberMill: 'lumberMill',
  Quarry: 'quarry',
  Mine: 'mine',
  Mill: 'mill',
  Blacksmith: 'blacksmith',
  Workshop: 'workshop',
  Store: 'store',
  Market: 'market',
  School: 'school',
  Hospital: 'hospital',
  TownHall: 'townHall',
  Church: 'church',
  Prison: 'prison',
  Well: 'well',
  Road: 'road',
  Mansion: 'mansion',
  TamingPost: 'tamingPost',
  Wall: 'wall',
  WallCorner: 'wallCorner',
  WallGate: 'wallGate',
  Watchtower: 'watchtower',
  Barracks: 'barracks',
  /** Outdoor hunting post — staffed hunters harvest nearby wildlife. */
  HuntingSpot: 'huntingSpot',
  /** Public house — free-time hangout: drink, chat, unwind. */
  Tavern: 'tavern',
  /** Guest lodging — visitors pay gold to sleep; staffed by hoteliers. */
  Hotel: 'hotel',
  /** Cross rivers — place on river / bank tiles only. Drop `public/sprites/bridge.png`. */
  Bridge: 'bridge',
} as const;
export type BuildingType = (typeof BuildingType)[keyof typeof BuildingType];
export interface Building {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  width: number;
  height: number;
  occupants: number[];
  level: number;
  constructionProgress: number;
  completed: boolean;
  health: number;
  maxHealth: number;
  // Visual
  spriteScale: number;
  buildAnimTimer: number;
  /** Rival settlement structures — not player-owned */
  faction?: 'rival';
  groupId?: string;
  campLabel?: string;
  /** Workshop only — which goods this building crafts */
  workshopRecipeId?: string;
  /** Strip orientation — 0/90 straight; 0/90/180/270 for wall corners. */
  rotation?: 0 | 90 | 180 | 270;
  /** Hotel only — visitor entity ids currently lodging (max HOTEL_GUEST_CAPACITY). */
  hotelGuestIds?: number[];
  /** Hunting Spot only — which prey the staffed hunters target (see HUNTING_SPOT_PREY_OPTIONS). */
  huntingSpotPrey?: HuntingSpotPrey;
}

export interface BuildingConfig {
  width: number;
  height: number;
  cost: { wood: number; stone: number; gold: number };
  /** Calendar days of on-site work (7am–7pm) for one builder to finish. */
  buildTime: number;
  /**
   * Slot cap for `building.occupants` — **overloaded by building role** (not one semantic):
   *
   * - **Housing** (House, Mansion, Hotel): bed / resident capacity (upgrades may raise
   *   effective beds via `getResidenceCapacity`; base value is the config floor/ceiling).
   * - **Staffed workplaces** (Farm, Church, Barracks, …): max assigned **workers/staff**
   *   while complete (`BUILDING_JOB_TYPES`); same field is also the **construction crew**
   *   cap while incomplete.
   * - **Prison**: guard + prisoner slots share this cap (prisoners typically leave one
   *   seat for a guard — see lifeSimulation / moonHowler helpers).
   * - **0**: no permanent staff and no builders via occupants (e.g. roads, walls, wells);
   *   construction may still progress passively.
   *
   * Do not assume beds ≡ staff; always interpret with building type + completed flag.
   */
  maxOccupants: number;
  emoji: string;
  label: string;
  description: string;
  sprite: string;
  backgroundColor: string;
  padShape: 'round' | 'rect' | 'circle' | 'road';
  /** Extra multiplier so trimmed sprites fill their footprint on the map. */
  spriteDisplayScale?: number;
  unlockRequirement?: string;
}

export const BUILDING_CONFIGS: Record<BuildingType, BuildingConfig> = {
  [BuildingType.House]: {
    width: 46, height: 40,
    cost: { wood: 40, stone: 10, gold: 5 },
    buildTime: 2, maxOccupants: 6,
    emoji: '🏠', label: 'House', description: 'Family home (6 slots). Upgrade to fit up to 10.',
    sprite: '/sprites/house.png', backgroundColor: '#d97706', padShape: 'round',
  },
  [BuildingType.Farm]: {
    width: 53, height: 46,
    cost: { wood: 25, stone: 0, gold: 5 },
    buildTime: 3, maxOccupants: 2,
    emoji: '🌾', label: 'Farm', description: 'Produces food for your village.',
    sprite: '/sprites/farm.png', backgroundColor: '#16a34a', padShape: 'rect',
  },
  [BuildingType.Greenhouse]: {
    width: 50, height: 43,
    cost: { wood: 30, stone: 10, gold: 15 },
    buildTime: 4, maxOccupants: 2,
    emoji: '🏡', label: 'Greenhouse', description: 'Efficient food production all year.',
    sprite: '/sprites/greenhouse.png', backgroundColor: '#15803d', padShape: 'rect',
    unlockRequirement: 'agriculture_1',
  },
  [BuildingType.Barn]: {
    width: 56, height: 46,
    cost: { wood: 50, stone: 5, gold: 10 },
    buildTime: 4, maxOccupants: 0,
    emoji: '🚜', label: 'Barn', description: 'Boosts nearby Farms & Greenhouses +35% — no workers needed.',
    sprite: '/sprites/barn.png', backgroundColor: '#ca8a04', padShape: 'rect',
  },
  [BuildingType.Silo]: {
    width: 36, height: 50,
    cost: { wood: 30, stone: 20, gold: 10 },
    buildTime: 3, maxOccupants: 0,
    emoji: '🌽', label: 'Silo', description: 'Passive food storage bonus.',
    sprite: '/sprites/silo.png', backgroundColor: '#65a30d', padShape: 'rect',
  },
  [BuildingType.LumberMill]: {
    width: 56, height: 46,
    cost: { wood: 35, stone: 10, gold: 10 },
    buildTime: 4, maxOccupants: 3,
    emoji: '🪵', label: 'Lumber Mill', description: 'Produces wood.',
    sprite: '/sprites/lumbermill.png', backgroundColor: '#57534e', padShape: 'rect',
  },
  [BuildingType.Quarry]: {
    width: 53, height: 46,
    cost: { wood: 20, stone: 10, gold: 10 },
    buildTime: 4, maxOccupants: 3,
    emoji: '🪨', label: 'Quarry', description: 'Produces stone.',
    sprite: '/sprites/quarry.png', backgroundColor: '#44403c', padShape: 'rect',
  },
  [BuildingType.Mine]: {
    width: 50, height: 46,
    cost: { wood: 40, stone: 20, gold: 25 },
    buildTime: 6, maxOccupants: 4,
    emoji: '⛏️', label: 'Mine', description: 'Produces lots of stone.',
    sprite: '/sprites/mine.png', backgroundColor: '#292524', padShape: 'rect',
    unlockRequirement: 'mining_1',
  },
  [BuildingType.Mill]: {
    width: 53, height: 46,
    cost: { wood: 45, stone: 25, gold: 30 },
    buildTime: 5, maxOccupants: 2,
    emoji: '🌾', label: 'Mill',
    description: 'When complete, passively boosts food production (no miller job). Up to 2 builders while under construction.',
    sprite: '/sprites/mill.png', backgroundColor: '#84cc16', padShape: 'rect',
    unlockRequirement: 'agriculture_2',
  },
  [BuildingType.Blacksmith]: {
    width: 53, height: 43,
    cost: { wood: 30, stone: 30, gold: 30 },
    buildTime: 5, maxOccupants: 2,
    emoji: '🔨', label: 'Blacksmith', description: 'Queue forge upgrades — iron gear, guard halberds, wall plates, pickaxes. Staffed smiths boost industry.',
    sprite: '/sprites/blacksmith.png', backgroundColor: '#c2410c', padShape: 'rect',
    unlockRequirement: 'forestry_1',
  },
  [BuildingType.Workshop]: {
    width: 50, height: 43,
    cost: { wood: 35, stone: 15, gold: 20 },
    buildTime: 4, maxOccupants: 2,
    emoji: '🔧', label: 'Workshop', description: 'Crafts frontier goods for gold — pick a recipe when built.',
    sprite: '/sprites/workshop.png', backgroundColor: '#ea580c', padShape: 'rect',
  },
  [BuildingType.Store]: {
    width: 46, height: 40,
    cost: { wood: 30, stone: 10, gold: 15 },
    buildTime: 3, maxOccupants: 1,
    emoji: '🏪', label: 'Store', description: 'Generates gold.',
    sprite: '/sprites/store.png', backgroundColor: '#f97316', padShape: 'rect',
  },
  [BuildingType.Market]: {
    width: 59, height: 50,
    cost: { wood: 50, stone: 20, gold: 40 },
    buildTime: 6, maxOccupants: 3,
    emoji: '🏛️', label: 'Market', description: 'Generates lots of gold.',
    sprite: '/sprites/market.png', backgroundColor: '#fb923c', padShape: 'rect',
    unlockRequirement: 'trade_1',
  },
  [BuildingType.School]: {
    width: 53, height: 46,
    cost: { wood: 50, stone: 30, gold: 25 },
    buildTime: 5, maxOccupants: 2,
    emoji: '🏫', label: 'School', description: 'Assign teachers yourself (up to 2) — children attend by day (up to 10 per school) for faster growth & graduation perks.',
    sprite: '/sprites/school.png', backgroundColor: '#2563eb', padShape: 'round',
    unlockRequirement: 'education_1',
  },
  [BuildingType.Hospital]: {
    width: 53, height: 46,
    cost: { wood: 40, stone: 40, gold: 50 },
    buildTime: 6, maxOccupants: 2,
    emoji: '🏥', label: 'Hospital', description: 'Staff doctors — settlers visit when sick or pregnant; treatments heal energy and steady mothers. Staffed wards lower village energy drain.',
    sprite: '/sprites/hospital.png', backgroundColor: '#db2777', padShape: 'round',
    unlockRequirement: 'medicine_1',
  },
  [BuildingType.TownHall]: {
    width: 63, height: 53,
    cost: { wood: 100, stone: 80, gold: 100 },
    buildTime: 8, maxOccupants: 3,
    emoji: '🏰', label: 'Town Hall', description: 'Civic hub — taxes, trade, immigration, elections & festivals. Staffed officials hear petitions, grant small aid, and hold leader audiences.',
    sprite: '/sprites/townhall.png', backgroundColor: '#1d4ed8', padShape: 'round',
    unlockRequirement: 'architecture_2',
  },
  [BuildingType.Church]: {
    width: 50, height: 56,
    cost: { wood: 45, stone: 35, gold: 20 },
    buildTime: 4, maxOccupants: 4,
    emoji: '⛪', label: 'Church', description: 'Staffed church boosts courtship and morals. Full-moon nights: up to 4 priests leave home to hunt the Moon Howler — more priests raise cure odds (35% → 71%); Barracks guards nearby can protect a priest from a failed rite.',
    sprite: '/sprites/church.png', backgroundColor: '#4f46e5', padShape: 'round',
  },
  [BuildingType.Well]: {
    width: 30, height: 30,
    cost: { wood: 15, stone: 10, gold: 5 },
    buildTime: 1, maxOccupants: 0,
    emoji: '🌊', label: 'Well', description: 'Reduces human energy consumption.',
    sprite: '/sprites/well.png', backgroundColor: '#0891b2', padShape: 'circle',
  },
  [BuildingType.Road]: {
    width: 66, height: 26,
    cost: { wood: 5, stone: 5, gold: 0 },
    buildTime: 1, maxOccupants: 0,
    emoji: '🛤️', label: 'Road', description: 'Speeds up travel, fragments wildlife habitat.',
    sprite: '/sprites/road.png', backgroundColor: '#4b5563', padShape: 'road',
  },
  [BuildingType.Mansion]: {
    width: 59, height: 50,
    cost: { wood: 120, stone: 80, gold: 100 },
    buildTime: 7, maxOccupants: 8,
    emoji: '🏯', label: 'Mansion', description: 'Large family home (base 8 beds; upgrades add capacity). Attracts more immigrants.',
    sprite: '/sprites/mansion.png', backgroundColor: '#b45309', padShape: 'round',
    unlockRequirement: 'architecture_1',
  },
  [BuildingType.Prison]: {
    width: 50, height: 46,
    cost: { wood: 60, stone: 40, gold: 30 },
    buildTime: 5, maxOccupants: 2,
    emoji: '⛓️', label: 'Prison', description: 'Holds scandalous settlers for a short sentence. Requires a Guard.',
    sprite: '/sprites/prison.png', backgroundColor: '#475569', padShape: 'rect',
    unlockRequirement: 'architecture_1',
  },
  [BuildingType.TamingPost]: {
    width: 43, height: 43,
    cost: { wood: 35, stone: 15, gold: 20 },
    buildTime: 3, maxOccupants: 2,
    emoji: '🦴', label: 'Taming Post',
    description: 'Lets settlers tame nearby wildlife. No permanent staff — builders only during construction.',
    sprite: '/sprites/stump.png', backgroundColor: '#7c3aed', padShape: 'circle',
  },
  [BuildingType.Wall]: {
    width: 60, height: 40,
    cost: { wood: 8, stone: 14, gold: 0 },
    buildTime: 1, maxOccupants: 0,
    emoji: '🧱', label: 'Wall', description: 'Stone palisade segment — +8 barricade strength each (cap +72).',
    sprite: '/sprites/wall_straight.png', backgroundColor: '#64748b', padShape: 'rect',
    unlockRequirement: 'defense_1',
  },
  [BuildingType.WallCorner]: {
    width: 48, height: 48,
    cost: { wood: 10, stone: 16, gold: 0 },
    buildTime: 1, maxOccupants: 0,
    emoji: '↪️', label: 'Wall Corner', description: 'L-shaped wall junction — counts as a wall segment for defense.',
    sprite: '/sprites/wall_corner.png', backgroundColor: '#64748b', padShape: 'rect',
    unlockRequirement: 'defense_1',
  },
  [BuildingType.WallGate]: {
    width: 60, height: 48,
    cost: { wood: 18, stone: 28, gold: 8 },
    buildTime: 2, maxOccupants: 0,
    emoji: '🚪', label: 'Wall Gate', description: 'Gated entrance — strong wall segment with drawbridge flair.',
    sprite: '/sprites/wall_gate.png', backgroundColor: '#64748b', padShape: 'rect',
    unlockRequirement: 'defense_1',
  },
  [BuildingType.Watchtower]: {
    width: 44, height: 52,
    cost: { wood: 28, stone: 42, gold: 12 },
    buildTime: 4, maxOccupants: 0,
    emoji: '🗼', label: 'Watchtower', description: 'Overwatch post — +15 barricade strength and early raid warning.',
    sprite: '/sprites/watchtower.png', backgroundColor: '#475569', padShape: 'rect',
    unlockRequirement: 'defense_1',
  },
  [BuildingType.Barracks]: {
    width: 56, height: 50,
    cost: { wood: 85, stone: 65, gold: 35 },
    buildTime: 6, maxOccupants: 4,
    emoji: '⚔️', label: 'Barracks', description: 'Staff Guards to patrol the village (+12 militia strength each).',
    sprite: '/sprites/barracks.png', backgroundColor: '#57534e', padShape: 'rect',
    unlockRequirement: 'defense_2',
  },
  [BuildingType.HuntingSpot]: {
    width: 44, height: 40,
    cost: { wood: 30, stone: 10, gold: 15 },
    buildTime: 3, maxOccupants: 2,
    emoji: '🏹', label: 'Hunting Spot', description: 'Staff hunters to harvest nearby wildlife for food. Wolves may fight back.',
    sprite: '/sprites/huntingspot.png', backgroundColor: '#854d0e', padShape: 'circle',
  },
  [BuildingType.Tavern]: {
    width: 56, height: 48,
    cost: { wood: 55, stone: 25, gold: 30 },
    buildTime: 4, maxOccupants: 2,
    emoji: '🍺', label: 'Tavern', description: 'Village pub — guests visit after work and on free days. Staff an Innkeeper who works evenings (5pm–11pm) and all day and night during festivals.',
    sprite: '/sprites/tavern.png', backgroundColor: '#b45309', padShape: 'round',
  },
  [BuildingType.Hotel]: {
    width: 60, height: 52,
    cost: { wood: 70, stone: 40, gold: 55 },
    buildTime: 5, maxOccupants: 2,
    emoji: '🏨', label: 'Hotel', description: 'Visitor lodging — staff Hoteliers (day shift). Up to 4 guests sleep overnight for gold.',
    sprite: '/sprites/hotel.png', backgroundColor: '#0e7490', padShape: 'round',
    unlockRequirement: 'trade_1',
  },
  [BuildingType.Bridge]: {
    // Matches OpenGameArt stone path strip (top-down deck); R rotates across the river
    width: 64, height: 22,
    cost: { wood: 45, stone: 35, gold: 15 },
    buildTime: 3, maxOccupants: 0,
    emoji: '🌉', label: 'Bridge', description: 'Spans a river — place on river/bank. 1.5× walk like roads (R rotates). Art: hand-made seamless wooden deck (scripts/generate-bridge-sprite.mjs).',
    sprite: '/sprites/bridge.png', backgroundColor: '#6b7280', padShape: 'road',
    unlockRequirement: 'architecture_1',
    spriteDisplayScale: 1.05,
  },
};

