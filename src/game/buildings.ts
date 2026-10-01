import type { HuntingSpotPrey } from './huntingSpots';

export const BuildingType = {
  House: 'house',
  Farm: 'farm',
  Greenhouse: 'greenhouse',
  Barn: 'barn',
  Silo: 'silo',
  /** Dry shelter for winter firewood — +800 wood storage, no workers. */
  WoodStorehouse: 'woodStorehouse',
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
  /** Official residence of the elected village leader — unique, free, reserved housing. */
  LeaderHouse: 'leaderHouse',
  Church: 'church',
  Prison: 'prison',
  Well: 'well',
  Road: 'road',
  Mansion: 'mansion',
  TamingPost: 'tamingPost',
  Wall: 'wall',
  WallGate: 'wallGate',
  Watchtower: 'watchtower',
  Barracks: 'barracks',
  /** Outdoor hunting post — staffed hunters harvest nearby wildlife. */
  HuntingSpot: 'huntingSpot',
  /** Riverside fishing post — staffed fishers harvest food from the water. */
  FishingSpot: 'fishingSpot',
  /** Fenced wild grove — restores ecosystem health, no workers. */
  WildlifePreserve: 'wildlifePreserve',
  /** Public house — free-time hangout: drink, chat, unwind. */
  Tavern: 'tavern',
  /** Guest lodging — visitors pay gold to sleep; staffed by hoteliers. */
  Hotel: 'hotel',
  /** Cross rivers — place on river / bank tiles only. */
  Bridge: 'bridge',
  // ── Decor (Phase 3.2 — beauty grid) ──
  /** Flower garden — neighborhood beauty + a spot settlers like to sit. */
  Garden: 'garden',
  /** Carved stone statue — the strongest beauty nudge in the village. */
  Statue: 'statue',
  /** Street lamp — constant beauty nudge (no day/night change). */
  Lamp: 'lamp',
  /** Light wooden fence — cheap strip that prettifies a boundary. */
  Fence: 'fence',
} as const;

export type BuildingType = (typeof BuildingType)[keyof typeof BuildingType];

/** Player-controlled staffing policy for a completed workplace. */
export type StaffingMode = 'auto' | 'manual';

/**
 * What a Mine extracts, chosen per mine. Stone is the Quarry's job — a Mine
 * yields the ores only (see `mineOreForMode`).
 */
export const MINE_ORES = ['iron', 'gold'] as const;
export type MineMode = (typeof MINE_ORES)[number];

/**
 * The ore a Mine extracts right now. Gold only when the player chose it; iron
 * otherwise — which also covers a save written while the Mine still had a
 * `stone` mode (there was no gold mode to fall back from).
 */
export function mineOreForMode(mode: string | undefined): MineMode {
  return mode === 'gold' ? 'gold' : 'iron';
}

/** Discrete 90-degree building orientation steps. */
export type BuildingRotation = 0 | 90 | 180 | 270;

export interface BuildingCost {
  wood: number;
  stone: number;
  gold: number;
  iron?: number;
}

export interface Building {
  id: number;
  type: BuildingType;
  x: number;
  y: number;
  width: number;
  height: number;
  occupants: number[];
  /** Optional for save compatibility; absent means the legacy default policy. */
  staffingMode?: StaffingMode;
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
  rotation?: BuildingRotation;
  /** Hotel only — visitor entity ids currently lodging (max HOTEL_GUEST_CAPACITY). */
  hotelGuestIds?: number[];
  /** Hunting Spot only — which prey the staffed hunters target (see HUNTING_SPOT_PREY_OPTIONS). */
  huntingSpotPrey?: HuntingSpotPrey;
  /**
   * Hunting Spot only — the animal the spot is currently **committed** to, by entity id.
   *
   * A chase needs one animal to chase. Without a commitment the spot re-picked the nearest candidate
   * every tick, so a hunter standing among a herd swapped targets continuously and closed on none of
   * them (measured: parked at ~150 px while the pick cycled #357 → #431 → #452 across a single day).
   * Written by the spot's own pass (`dailyBuildingEconomy`), read by the hunter's movement
   * (`humanTick`) and by the shot, so all three chase the same animal. Cleared when the animal dies, is
   * tamed, or walks out of the spot's eyes.
   */
  huntingSpotTargetId?: number;
  /**
   * Hunting Spot only — the last tick the assigned hunter stood within killing distance of its target.
   *
   * The shot is resolved by the spot's production pass, which samples **one instant**; the hunter is
   * beside a wandering animal for many ticks and at its post for many others, and the two never lined up.
   * Measured: 162 "Too far to shoot" decisions across twelve colony days — every one of them at
   * 00:00–01:00 with the hunter back at its post (`huntTargetId=none`) — and no catch at all, even though
   * the hunter had closed to 10 px that same day. So the contact is recorded when it happens and the pass
   * accepts a *recent* one (`HUNTING_SPOT_STRIKE_GRACE_TICKS`).
   */
  huntingSpotInReachTick?: number;
  /** Mine only — extracts stone (default) or iron. */
  mineMode?: MineMode;
}

export interface BuildingConfig {
  width: number;
  height: number;
  cost: BuildingCost;
  /** Calendar days of on-site work normal workday for one builder to finish. */
  buildTime: number;
  /**
   * Slot cap for `building.occupants` — **overloaded by building role**:
   *
   * - **Housing** (House, Mansion, LeaderHouse): bed / resident capacity.
   * - **Staffed workplaces** (Farm, Church, Barracks, Hotel, …): max assigned **workers/staff**.
   * - **Prison**: guard + prisoner slots share this cap.
   * - **0**: no permanent staff and no residents (e.g. roads, walls, wells, barn, mill).
   */
  maxOccupants: number;
  emoji: string;
  label: string;
  description: string;
  sprite: string;
  backgroundColor: string;
  padShape: 'round' | 'rect' | 'circle' | 'road';
  /** Extra multiplier so a sprite fills its intended map footprint. */
  spriteDisplayScale?: number;
  /** Visible-base anchor within the source sprite (0 = top, 1 = bottom). */
  spriteAnchorY?: number;
  unlockRequirement?: string;
  /** Decor only — neighborhood beauty contribution (see beautyGrid). */
  beauty?: number;
  /** Decor only — procedural draw + feeds the beauty grid; no sprite/staff. */
  decor?: boolean;
  /** One per village — placement is rejected while any building of this type exists. */
  unique?: boolean;
}

export const BUILDING_CONFIGS: Readonly<Record<BuildingType, BuildingConfig>> = {
  [BuildingType.House]: {
    width: 46,
    height: 40,
    // No gold: housing is survival, and a colony at 0 gold with homeless settlers must
    // still be able to build (this is the exact state that stalled a measured 30-day run
    // for ten days — see docs/plans/auto-play-missing-rules-plan.md).
    cost: { wood: 40, stone: 10, gold: 0 },
    buildTime: 2,
    maxOccupants: 6,
    emoji: '🏠',
    label: 'House',
    description: 'Family home (6 slots). Upgrade to fit up to 10.',
    sprite: '/sprites/house.png',
    backgroundColor: '#d97706',
    padShape: 'round',
  },
  [BuildingType.Farm]: {
    width: 53,
    height: 46,
    // No gold: feeding the colony must not depend on the one material a colony can be
    // completely out of (`dailyBuildingEconomy` pays farms in food, not gold).
    cost: { wood: 25, stone: 0, gold: 0 },
    buildTime: 3,
    maxOccupants: 2,
    emoji: '🌾',
    label: 'Farm',
    description: 'Produces food for your village.',
    sprite: '/sprites/farm.png',
    backgroundColor: '#16a34a',
    padShape: 'rect',
  },
  [BuildingType.Greenhouse]: {
    width: 50,
    height: 43,
    cost: { wood: 30, stone: 10, gold: 0 },
    buildTime: 4,
    maxOccupants: 2,
    emoji: '🏡',
    label: 'Greenhouse',
    description: 'Efficient food production all year.',
    sprite: '/sprites/greenhouse.png',
    backgroundColor: '#15803d',
    padShape: 'rect',
    unlockRequirement: 'agriculture_1',
  },
  [BuildingType.Barn]: {
    width: 56,
    height: 46,
    cost: { wood: 50, stone: 5, gold: 10 },
    buildTime: 4,
    maxOccupants: 0,
    emoji: '🚜',
    label: 'Barn',
    description: 'Boosts nearby Farms & Greenhouses +35% · extends wood storage +300 — no workers needed.',
    sprite: '/sprites/barn.png',
    backgroundColor: '#ca8a04',
    padShape: 'rect',
  },
  [BuildingType.Silo]: {
    width: 36,
    height: 50,
    cost: { wood: 30, stone: 20, gold: 10 },
    buildTime: 3,
    maxOccupants: 0,
    emoji: '🌽',
    label: 'Silo',
    description: 'Passive food storage bonus.',
    sprite: '/sprites/silo.png',
    backgroundColor: '#65a30d',
    padShape: 'rect',
  },
  [BuildingType.WoodStorehouse]: {
    width: 72,
    height: 48,
    cost: { wood: 40, stone: 20, gold: 15 },
    buildTime: 4,
    maxOccupants: 0,
    emoji: '🏚️',
    label: 'Wood Storehouse',
    description: 'Dry shelter for winter firewood — +800 wood storage (winter fuel), no workers needed.',
    sprite: '/sprites/storehouse_wood.png',
    backgroundColor: '#92400e',
    padShape: 'rect',
    // This art's painted base sits at 96.2 % of the PNG rather than the 100 % of the edge-to-edge
    // building sprites, so the default 0.92 anchor stood it ~4 % of sprite height proud of the
    // ground line. Anchor at `paintedBase − 0.08` to sink it by the same 8 % as the rest (the value
    // LeaderHouse already carries for the same reason).
    spriteAnchorY: 0.882,
  },
  [BuildingType.LumberMill]: {
    width: 56,
    height: 46,
    // No wood, and no gold: a colony at 0 wood must still be able to raise the building
    // that makes wood. Paid in stone, which the Quarry makes from wood alone.
    cost: { wood: 0, stone: 30, gold: 0 },
    buildTime: 4,
    maxOccupants: 3,
    emoji: '🪵',
    label: 'Lumber Mill',
    description: 'Produces wood.',
    sprite: '/sprites/lumbermill.png',
    backgroundColor: '#57534e',
    padShape: 'rect',
  },
  [BuildingType.Quarry]: {
    width: 53,
    height: 46,
    // No stone (it makes stone) and no gold: paid in wood, which the Lumber Mill makes
    // from stone alone — so the pair bootstraps from either material.
    cost: { wood: 30, stone: 0, gold: 0 },
    buildTime: 4,
    maxOccupants: 3,
    emoji: '🪨',
    label: 'Quarry',
    description: 'Produces stone.',
    sprite: '/sprites/quarry.png',
    backgroundColor: '#44403c',
    padShape: 'rect',
  },
  [BuildingType.Mine]: {
    width: 50,
    height: 46,
    // No gold: the Mine can dig the gold seam, so a colony at 0 gold must still be able
    // to build it. Paid in wood and stone.
    cost: { wood: 35, stone: 25, gold: 0 },
    buildTime: 6,
    maxOccupants: 4,
    emoji: '⛏️',
    label: 'Mine',
    description: 'Produces iron ore or gold — set the ore per mine. Stone comes from the Quarry.',
    sprite: '/sprites/mine.png',
    backgroundColor: '#292524',
    padShape: 'rect',
  },
  [BuildingType.Mill]: {
    width: 53,
    height: 46,
    cost: { wood: 45, stone: 25, gold: 30 },
    buildTime: 5,
    maxOccupants: 0, // Corrected: passive boost, requires no permanent workers
    emoji: '🌾',
    label: 'Mill',
    description: 'When complete, passively boosts food production (no permanent workers needed).',
    sprite: '/sprites/mill.png',
    backgroundColor: '#84cc16',
    padShape: 'rect',
    unlockRequirement: 'agriculture_2',
  },
  [BuildingType.Blacksmith]: {
    width: 53,
    height: 43,
    cost: { wood: 30, stone: 30, gold: 30 },
    buildTime: 5,
    maxOccupants: 2,
    emoji: '🔨',
    label: 'Blacksmith',
    description: 'Queue forge upgrades — iron gear, guard halberds, wall plates, pickaxes. Staffed smiths boost industry.',
    sprite: '/sprites/blacksmith.png',
    backgroundColor: '#c2410c',
    padShape: 'rect',
    unlockRequirement: 'forestry_1',
  },
  [BuildingType.Workshop]: {
    width: 50,
    height: 43,
    cost: { wood: 35, stone: 15, gold: 20 },
    buildTime: 4,
    maxOccupants: 2,
    emoji: '🔧',
    label: 'Workshop',
    description: 'Crafts frontier goods for gold — pick a recipe when built.',
    sprite: '/sprites/workshop.png',
    backgroundColor: '#ea580c',
    padShape: 'rect',
  },
  [BuildingType.Store]: {
    width: 46,
    height: 40,
    // "Generates gold." — so it must not cost gold, or a colony at 0 gold could never
    // build its way back. Paid in wood and stone.
    cost: { wood: 35, stone: 20, gold: 0 },
    buildTime: 3,
    maxOccupants: 1,
    emoji: '🏪',
    label: 'Store',
    description: 'Generates gold.',
    sprite: '/sprites/store.png',
    backgroundColor: '#f97316',
    padShape: 'rect',
  },
  [BuildingType.Market]: {
    width: 59,
    height: 50,
    cost: { wood: 50, stone: 20, gold: 40 },
    buildTime: 6,
    maxOccupants: 3,
    emoji: '🏛️',
    label: 'Market',
    description: 'Generates lots of gold.',
    sprite: '/sprites/market.png',
    backgroundColor: '#fb923c',
    padShape: 'rect',
    unlockRequirement: 'trade_1',
  },
  [BuildingType.School]: {
    width: 53,
    height: 46,
    cost: { wood: 50, stone: 30, gold: 25 },
    buildTime: 5,
    maxOccupants: 2,
    emoji: '🏫',
    label: 'School',
    description: 'Assign teachers (up to 2) — children attend by day for faster growth & graduation perks.',
    sprite: '/sprites/school.png',
    backgroundColor: '#2563eb',
    padShape: 'round',
    unlockRequirement: 'education_1',
  },
  [BuildingType.Hospital]: {
    width: 53,
    height: 46,
    cost: { wood: 40, stone: 40, gold: 50 },
    buildTime: 6,
    maxOccupants: 2,
    emoji: '🏥',
    label: 'Hospital',
    description: 'Staff doctors — settlers visit when sick or pregnant. Staffed wards lower village energy drain.',
    sprite: '/sprites/hospital.png',
    backgroundColor: '#db2777',
    padShape: 'round',
    unlockRequirement: 'medicine_1',
  },
  [BuildingType.TownHall]: {
    width: 63,
    height: 53,
    cost: { wood: 100, stone: 80, gold: 100 },
    buildTime: 8,
    maxOccupants: 3,
    emoji: '🏰',
    label: 'Town Hall',
    description: 'Civic hub — taxes, trade, immigration, elections & festivals. Staffed officials hear petitions.',
    sprite: '/sprites/townhall.png',
    backgroundColor: '#1d4ed8',
    padShape: 'round',
    unlockRequirement: 'architecture_2',
    unique: true,
  },
  [BuildingType.Church]: {
    width: 50,
    height: 56,
    cost: { wood: 45, stone: 35, gold: 20 },
    buildTime: 4,
    maxOccupants: 4,
    emoji: '⛪',
    label: 'Church',
    description: 'Staffed church boosts courtship and morals. Priests perform Moon Howler curing rites.',
    sprite: '/sprites/church.png',
    backgroundColor: '#4f46e5',
    padShape: 'round',
    unique: true,
  },
  [BuildingType.Well]: {
    width: 30,
    height: 30,
    cost: { wood: 15, stone: 10, gold: 5 },
    buildTime: 1,
    maxOccupants: 0,
    emoji: '🌊',
    label: 'Well',
    description: 'Reduces human energy consumption in the neighborhood.',
    sprite: '/sprites/well.png',
    backgroundColor: '#0891b2',
    padShape: 'circle',
  },
  [BuildingType.Mansion]: {
    width: 59,
    height: 50,
    cost: { wood: 120, stone: 80, gold: 100 },
    buildTime: 7,
    maxOccupants: 8,
    emoji: '🏯',
    label: 'Mansion',
    description: 'Large family home (base 8 beds; upgrades add capacity). Attracts more immigrants.',
    sprite: '/sprites/mansion.png',
    backgroundColor: '#b45309',
    padShape: 'round',
    unlockRequirement: 'architecture_1',
  },
  [BuildingType.LeaderHouse]: {
    width: 63,
    height: 53,
    cost: { wood: 0, stone: 0, gold: 0 },
    buildTime: 2,
    maxOccupants: 12,
    emoji: '👑',
    label: "Leader's House",
    description: 'Official residence of the elected village leader.',
    sprite: '/sprites/house_leader.png',
    backgroundColor: '#7c2d12',
    padShape: 'round',
    spriteDisplayScale: 1.32,
    spriteAnchorY: 0.836,
    unique: true,
  },
  [BuildingType.Prison]: {
    width: 50,
    height: 46,
    cost: { wood: 60, stone: 40, gold: 30 },
    buildTime: 5,
    // Three 8-hour guard shifts cover the day, plus one slot for the prisoner they hold.
    maxOccupants: 4,
    emoji: '⛓️',
    label: 'Prison',
    description: 'Holds scandalous settlers for a short sentence. Three guards cover a full day.',
    sprite: '/sprites/prison.png',
    backgroundColor: '#475569',
    padShape: 'rect',
    unlockRequirement: 'architecture_1',
  },
  [BuildingType.TamingPost]: {
    width: 43,
    height: 43,
    cost: { wood: 35, stone: 15, gold: 20 },
    buildTime: 3,
    maxOccupants: 2,
    emoji: '🦴',
    label: 'Taming Post',
    description: 'Lets settlers tame nearby wildlife. Builders only during construction.',
    sprite: '/sprites/taming_post.png',
    backgroundColor: '#7c3aed',
    padShape: 'circle',
  },
  [BuildingType.Road]: {
    width: 66,
    height: 26,
    cost: { wood: 5, stone: 5, gold: 0 },
    buildTime: 1,
    maxOccupants: 0,
    emoji: '🛤️',
    label: 'Road',
    description: 'Speeds up travel, fragments wildlife habitat.',
    sprite: '/sprites/road.png',
    backgroundColor: '#4b5563',
    padShape: 'road',
  },
  [BuildingType.Wall]: {
    width: 60,
    height: 40,
    cost: { wood: 8, stone: 14, gold: 0 },
    buildTime: 1,
    maxOccupants: 0,
    emoji: '🧱',
    label: 'Wall',
    description: 'Stone palisade segment — adds barricade strength; wall plates raise the cap.',
    sprite: '/sprites/wall_isometric.png',
    backgroundColor: '#64748b',
    padShape: 'rect',
    unlockRequirement: 'defense_1',
  },
  [BuildingType.WallGate]: {
    width: 60,
    height: 48,
    cost: { wood: 18, stone: 28, gold: 8 },
    buildTime: 2,
    maxOccupants: 0,
    emoji: '🚪',
    label: 'Wall Gate',
    description: 'Gated entrance — strong wall segment with drawbridge flair.',
    sprite: '/sprites/gate_isometric.png',
    backgroundColor: '#64748b',
    padShape: 'rect',
    unlockRequirement: 'defense_1',
  },
  [BuildingType.Watchtower]: {
    width: 44,
    height: 52,
    cost: { wood: 28, stone: 42, gold: 12 },
    buildTime: 4,
    maxOccupants: 0,
    emoji: '🗼',
    label: 'Watchtower',
    description: 'Overwatch post — adds barricade strength and early raid warning.',
    sprite: '/sprites/watchtower_isometric.png',
    backgroundColor: '#475569',
    padShape: 'rect',
    unlockRequirement: 'defense_1',
  },
  [BuildingType.Barracks]: {
    width: 56,
    height: 50,
    cost: { wood: 85, stone: 65, gold: 35 },
    buildTime: 6,
    maxOccupants: 4,
    emoji: '⚔️',
    label: 'Barracks',
    // The per-guard strength is `MILITIA_BALANCE.guardBonusPerGuard` (defenseStructures, the owner).
    // Importing it here would close a cycle — `defenseStructures` reads `gameTypes`, which reads this
    // file — so the catalogue copy carries no number, the same remedy as the wall/watchtower
    // descriptions above (`tests/copyAndDayIndex.owners.test.ts`, L2).
    description: 'Staff Soldiers to patrol the village — each guard adds militia strength.',
    sprite: '/sprites/barracks.png',
    backgroundColor: '#57534e',
    padShape: 'rect',
    unlockRequirement: 'defense_2',
  },
  [BuildingType.HuntingSpot]: {
    width: 44,
    height: 40,
    cost: { wood: 30, stone: 10, gold: 0 },
    buildTime: 3,
    maxOccupants: 2,
    emoji: '🏹',
    label: 'Hunting Spot',
    description: 'Staff hunters to harvest nearby wildlife for food. Wolves may fight back.',
    sprite: '/sprites/huntingspot.png',
    backgroundColor: '#854d0e',
    padShape: 'circle',
    // Painted base at 92.7 % of the PNG — see the Wood Storehouse note above.
    spriteAnchorY: 0.847,
  },
  [BuildingType.FishingSpot]: {
    width: 52,
    height: 40,
    cost: { wood: 20, stone: 15, gold: 0 },
    buildTime: 3,
    maxOccupants: 2,
    emoji: '🎣',
    label: 'Fishing Spot',
    description: 'Riverside post — staffed fishers harvest food from the water.',
    sprite: '/sprites/fishingspot.png',
    backgroundColor: '#0369a1',
    padShape: 'rect',
  },
  [BuildingType.WildlifePreserve]: {
    width: 64,
    height: 64,
    cost: { wood: 50, stone: 40, gold: 30 },
    buildTime: 5,
    maxOccupants: 0,
    emoji: '🌳',
    label: 'Wildlife Preserve',
    // As with the Barracks above: the amount is `PRESERVE_HEALTH_BONUS` (dailyEcology), reachable
    // only through `gameTypes`, so the catalogue states the rule without a number.
    description: 'Fenced wild grove — restores ecosystem health and helps wildlife recover. No workers.',
    sprite: '/sprites/wildlife_preserve.png',
    backgroundColor: '#166534',
    padShape: 'rect',
  },
  [BuildingType.Tavern]: {
    width: 56,
    height: 48,
    cost: { wood: 55, stone: 25, gold: 30 },
    buildTime: 4,
    maxOccupants: 2,
    emoji: '🍺',
    label: 'Tavern',
    description: 'Village pub — guests visit after work. Staff an Innkeeper who works evenings & festivals.',
    sprite: '/sprites/tavern.png',
    backgroundColor: '#b45309',
    padShape: 'round',
  },
  [BuildingType.Hotel]: {
    width: 60,
    height: 52,
    cost: { wood: 70, stone: 40, gold: 55 },
    buildTime: 5,
    maxOccupants: 2,
    emoji: '🏨',
    label: 'Hotel',
    // No guest count here: `HOTEL_GUEST_CAPACITY` is the owner, and this catalogue is deliberately
    // import-free (one type-only import), so a restated number would drift exactly as the Barracks
    // "+14" and the preserve "+4" did.
    description: 'Visitor lodging — staff Hoteliers (day shift). Guests sleep overnight for free.',
    sprite: '/sprites/hotel.png',
    backgroundColor: '#0e7490',
    padShape: 'round',
    unlockRequirement: 'trade_1',
  },
  [BuildingType.Bridge]: {
    width: 64,
    height: 22,
    cost: { wood: 45, stone: 35, gold: 15 },
    buildTime: 3,
    maxOccupants: 0,
    emoji: '🌉',
    label: 'Bridge',
    description: 'Spans a river — place on river/bank. 1.5× walk speed like roads.',
    sprite: '/sprites/bridge.png',
    backgroundColor: '#6b7280',
    padShape: 'road',
    unlockRequirement: 'architecture_1',
    spriteDisplayScale: 1.05,
  },
  [BuildingType.Garden]: {
    width: 42,
    height: 38,
    cost: { wood: 12, stone: 4, gold: 2 },
    buildTime: 1,
    maxOccupants: 0,
    emoji: '🌷',
    label: 'Garden',
    description: 'A flower bed — neighborhood beauty where settlers drift in free time.',
    sprite: '/sprites/garden.png',
    backgroundColor: '#84cc16',
    padShape: 'rect',
    beauty: 3,
    decor: true,
  },
  [BuildingType.Statue]: {
    width: 30,
    height: 32,
    cost: { wood: 0, stone: 25, gold: 15 },
    buildTime: 2,
    maxOccupants: 0,
    emoji: '🗿',
    label: 'Statue',
    description: 'Carved stone — the strongest beauty nudge in the village.',
    sprite: '/sprites/statue.png',
    backgroundColor: '#a8a29e',
    padShape: 'circle',
    beauty: 5,
    decor: true,
  },
  [BuildingType.Lamp]: {
    width: 22,
    height: 26,
    cost: { wood: 10, stone: 6, gold: 3 },
    buildTime: 1,
    maxOccupants: 0,
    emoji: '🏮',
    label: 'Lamp',
    description: 'Street lamp — a constant warm landmark on the square.',
    sprite: '/sprites/lamp.png',
    backgroundColor: '#eab308',
    padShape: 'circle',
    beauty: 2,
    decor: true,
  },
  [BuildingType.Fence]: {
    width: 44,
    height: 12,
    cost: { wood: 6, stone: 2, gold: 0 },
    buildTime: 1,
    maxOccupants: 0,
    emoji: '🚧',
    label: 'Fence',
    description: 'A light wooden fence — cheap beauty that prettifies a boundary.',
    sprite: '/sprites/fence.png',
    backgroundColor: '#a16207',
    padShape: 'road',
    beauty: 1,
    decor: true,
  },
};
