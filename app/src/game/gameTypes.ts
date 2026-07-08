// Entity types as const object
export const EntityType = {
  Grass: 'grass',
  Rabbit: 'rabbit',
  Deer: 'deer',
  Wolf: 'wolf',
  Fox: 'fox',
  Human: 'human',
  Tree: 'tree',
  Werewolf: 'werewolf',
  Wildkin: 'wildkin',
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];

/** Alive entities bucketed by `entity.type` — rebuilt each sim tick, not saved. */
export type EntityByType = Record<EntityType, Entity[]>;

/** Sentinel for render caches keyed off sim tick. */
export const UNCACHED_RENDER_TICK = -1;

export function emptyEntityByType(): EntityByType {
  const byType = {} as EntityByType;
  for (const type of Object.values(EntityType) as EntityType[]) {
    byType[type] = [];
  }
  return byType;
}

/** Canvas draw layer — matches `renderSoAEntities` bucket rules. */
export type RenderEntityLayer = 'grass' | 'tree' | 'human' | 'animal';

export function getRenderEntityLayer(type: EntityType): RenderEntityLayer {
  if (type === EntityType.Grass) return 'grass';
  if (type === EntityType.Tree) return 'tree';
  if (type === EntityType.Human) return 'human';
  return 'animal';
}

// Building types as const object
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
} as const;
export type BuildingType = (typeof BuildingType)[keyof typeof BuildingType];

// Seasons as const object
export const Season = {
  Spring: 'spring',
  Summer: 'summer',
  Fall: 'fall',
  Winter: 'winter',
} as const;
export type Season = (typeof Season)[keyof typeof Season];

// Weather types
export const WeatherType = {
  Clear: 'clear',
  Rain: 'rain',
  Snow: 'snow',
  Storm: 'storm',
  Fog: 'fog',
  Drought: 'drought',
} as const;
export type WeatherType = (typeof WeatherType)[keyof typeof WeatherType];

// Research types
export const ResearchType = {
  Agriculture: 'agriculture',
  Forestry: 'forestry',
  Mining: 'mining',
  Architecture: 'architecture',
  Medicine: 'medicine',
  Trade: 'trade',
  Education: 'education',
  Defense: 'defense',
} as const;
export type ResearchType = (typeof ResearchType)[keyof typeof ResearchType];

// Job / profession system
export const JobType = {
  Settler: 'settler',
  Farmer: 'farmer',
  Lumberjack: 'lumberjack',
  Miner: 'miner',
  Blacksmith: 'blacksmith',
  Merchant: 'merchant',
  Teacher: 'teacher',
  Doctor: 'doctor',
  Official: 'official',
  Priest: 'priest',
  Hunter: 'hunter',
  Builder: 'builder',
  Guard: 'guard',
  Housewife: 'housewife',
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

export const JOB_LABELS: Record<JobType, string> = {
  [JobType.Settler]: 'Settler',
  [JobType.Farmer]: 'Farmer',
  [JobType.Lumberjack]: 'Lumberjack',
  [JobType.Miner]: 'Miner',
  [JobType.Blacksmith]: 'Blacksmith',
  [JobType.Merchant]: 'Merchant',
  [JobType.Teacher]: 'Teacher',
  [JobType.Doctor]: 'Doctor',
  [JobType.Official]: 'Official',
  [JobType.Priest]: 'Priest',
  [JobType.Hunter]: 'Hunter',
  [JobType.Builder]: 'Builder',
  [JobType.Guard]: 'Guard',
  [JobType.Housewife]: 'Housewife',
};

export const BUILDING_JOB_TYPES: Partial<Record<BuildingType, JobType>> = {
  [BuildingType.Farm]: JobType.Farmer,
  [BuildingType.Greenhouse]: JobType.Farmer,

  [BuildingType.LumberMill]: JobType.Lumberjack,
  [BuildingType.Quarry]: JobType.Miner,
  [BuildingType.Mine]: JobType.Miner,
  [BuildingType.Blacksmith]: JobType.Blacksmith,
  [BuildingType.Workshop]: JobType.Blacksmith,
  [BuildingType.Store]: JobType.Merchant,
  [BuildingType.Market]: JobType.Merchant,
  [BuildingType.School]: JobType.Teacher,
  [BuildingType.Hospital]: JobType.Doctor,
  [BuildingType.TownHall]: JobType.Official,
  [BuildingType.Church]: JobType.Priest,
  [BuildingType.Prison]: JobType.Guard,
  [BuildingType.Barracks]: JobType.Guard,
};

export interface Entity {
  id: number;
  type: EntityType;
  x: number;
  y: number;
  energy: number;
  maxEnergy: number;
  age: number;
  birthYear: number;
  birthMonth: number;
  birthDay: number;
  maxAge: number;
  speed: number;
  size: number;
  vx: number;
  vy: number;
  reproductionCooldown: number;
  alive: boolean;
  flash: number;
  gender?: 'male' | 'female';
  isJuvenile: boolean;
  /** Colony days with meaningful attendance at a staffed school. */
  schoolDays?: number;
  /** Work-hour ticks accumulated today toward the next school day. */
  schoolTicksToday?: number;
  /** Set on graduation — grants skills, stamina, and village research bonus. */
  educated?: boolean;
  pregnant?: boolean;
  pregnancyProgress?: number;
  /** Workplace — farm, mill, etc. (assigned via building occupants) */
  homeBuildingId?: number;
  /** Where the settler sleeps — house or mansion */
  residenceBuildingId?: number;
  /** Building ID of the prison this settler is held in, if any. */
  prisonBuildingId?: number;
  /** Tick at which this settler is released from prison. */
  prisonerUntilTick?: number;
  /** Crime that led to the current prison sentence, if any. */
  prisonSentenceCrime?: 'scandal';
  occupation?: string;
  job?: JobType;
  skills: Partial<Record<JobType, number>>;
  relationshipStatus?: 'single' | 'married' | 'expecting';
  attraction?: number;
  partnerId?: number;
  /** Secret lover while still married (or paramour for a single settler). */
  affairPartnerId?: number;
  affairProgress?: number;
  /** Colony day + site of the latest off-screen/in-world affair encounter (for prison proximity). */
  lastAffairSiteDay?: number;
  lastAffairSiteX?: number;
  lastAffairSiteY?: number;
  /** Tick until another caught/rumor scandal can fire for this settler. */
  scandalCooldownUntilTick?: number;
  lastMetPartner?: number;
  courtshipProgress?: number;
  /** Biological father when pregnancy is not from the legal spouse. */
  pregnantById?: number;
  // Family
  fatherId?: number;
  motherId?: number;
  /** Born outside wedlock or to a father other than mother's spouse. */
  isBastard?: boolean;
  /** Set when no living parent/grandparent — village couple takes the child in. */
  adoptiveMotherId?: number;
  adoptiveFatherId?: number;
  childrenIds: number[];
  name?: string;
  surname?: string;
  /** Birth / maiden surname — restored for the woman when a caught-affair marriage ends. */
  maidenSurname?: string;
  generation: number;
  // Visual
  spriteAngle: number;
  animFrame: number;
  /** Outfit / appearance variant (0..3) */
  spriteVariant?: number;
  /** Per-entity salt mixed into combat rolls (stable across ticks, unique per entity). */
  combatRollSeed?: number;
  /** Short speech-bubble line shown above the settler */
  chatPhrase?: string;
  chatTicks?: number;
  /** Active multi-line dialogue partner (transient, not saved). */
  chatPartnerId?: number;
  /** Session key for 3-beat dialogue tree playback (transient, not saved). */
  chatDialogueSessionKey?: string;
  /** Cursed villager — human most days, dangerous werewolf on full-moon nights (~every 2 weeks) */
  moonHowlerCursed?: boolean;
  /** Human stats restored after a full-moon transformation ends */
  moonHowlerSaved?: {
    energy: number;
    maxEnergy: number;
    speed: number;
    size: number;
    job?: JobType;
    occupation?: string;
    homeBuildingId?: number;
    residenceBuildingId?: number;
    relationshipStatus?: 'single' | 'married' | 'expecting';
    partnerId?: number;
    affairPartnerId?: number;
    affairProgress?: number;
    courtshipProgress?: number;
    pregnant?: boolean;
    pregnantById?: number;
    pregnancyProgress?: number;
    huntTargetId?: number;
    combatTicks?: number;
  };
  // Taming
  tamedBy?: number;
  /** Non-player humans: visitors, rivals, or trade-route merchants */
  faction?: 'visitor' | 'rival' | 'trade_caravan';
  groupId?: string;
  /** Prey or predator being chased — used for hunt lines in the renderer */
  huntTargetId?: number;
  /** Brief combat flash after a hunt, block, or counter-attack */
  combatTicks?: number;
}

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
}

export interface WorkshopRecipe {
  id: string;
  label: string;
  emoji: string;
  description: string;
  inputs: Partial<Resources>;
  baseGold: number;
}

export const DEFAULT_WORKSHOP_RECIPE_ID = 'wooden_goods';

export const WORKSHOP_RECIPES: WorkshopRecipe[] = [
  {
    id: 'wooden_goods',
    label: 'Wooden goods',
    emoji: '🪵',
    description: 'Carved bowls, spoons, and simple trade goods.',
    inputs: { wood: 5 },
    baseGold: 4,
  },
  {
    id: 'stone_tools',
    label: 'Stone tools',
    emoji: '⛏️',
    description: 'Axes, hammers, and frontier hardware.',
    inputs: { wood: 3, stone: 2 },
    baseGold: 6,
  },
  {
    id: 'furniture',
    label: 'Furniture',
    emoji: '🪑',
    description: 'Sturdy chairs, tables, and cabin fittings.',
    inputs: { wood: 10, stone: 2 },
    baseGold: 10,
  },
  {
    id: 'trade_trinkets',
    label: 'Trade trinkets',
    emoji: '✨',
    description: 'Quick carved charms when wood is tight.',
    inputs: { wood: 2 },
    baseGold: 2,
  },
];

export function getWorkshopRecipe(recipeId?: string): WorkshopRecipe {
  return WORKSHOP_RECIPES.find((r) => r.id === recipeId) ?? WORKSHOP_RECIPES[0];
}

export function formatRecipeInputs(inputs: Partial<Resources>): string {
  const parts: string[] = [];
  if (inputs.wood) parts.push(`${inputs.wood} wood`);
  if (inputs.stone) parts.push(`${inputs.stone} stone`);
  if (inputs.food) parts.push(`${inputs.food} food`);
  if (inputs.gold) parts.push(`${inputs.gold} gold`);
  return parts.join(' + ') || '—';
}

export type VisitorKind = 'traders' | 'pilgrims' | 'scholars' | 'hunters' | 'nomads' | 'refugees' | 'performers';

export interface VisitorGroup {
  id: string;
  name: string;
  kind: VisitorKind;
  campX: number;
  campY: number;
  /** Midnights remaining after the arrival day — decrements once per calendar day boundary. */
  daysLeft: number;
  /** Colony calendar day when the group arrived (for daysLeft timing). */
  spawnedAtCalendarDay?: number;
  entityIds: number[];
  giftsGiven: number;
  /** Player-initiated trade while camped (v0.4.1). */
  tradesCompleted: number;
  /** Refugee families negotiated — no auto-join without player choice. */
  refugeeResolved: boolean;
  /** Caravan leader audience used for this visit (v0.4.1). */
  leaderTalked: boolean;
}

export type DiplomacyEventKind = 'tribute' | 'border_dispute' | 'alliance' | 'peace_treaty';

export interface DiplomacyChoice {
  id: string;
  label: string;
  hint: string;
}

export interface DiplomacyEvent {
  id: string;
  rivalId: string;
  rivalName: string;
  kind: DiplomacyEventKind;
  title: string;
  description: string;
  emoji: string;
  choices: DiplomacyChoice[];
  createdAtTick: number;
}

export type RivalRelationship = 'friendly' | 'neutral' | 'competitive' | 'tense';

export interface RivalSettlement {
  id: string;
  name: string;
  campX: number;
  campY: number;
  population: number;
  entityIds: number[];
  buildingIds: number[];
  relationship: RivalRelationship;
  foundedYear: number;
  daysUntilAction: number;
  /** Days until this rival can launch another raid. */
  raidCooldownDays: number;
  /** Days remaining on a signed peace treaty (no raids either direction). */
  peaceTreatyDays: number;
}

/** Transient screen particles — deaths, confetti, smoke (stored on `WorldState.deathParticles`). */
export interface DeathParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: 'blood' | 'sparkle' | 'smoke' | 'heart' | 'star';
}

export interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
  scale: number;
}

export interface GameEvent {
  id: string;
  title: string;
  description: string;
  emoji: string;
  effect: string;
  type: 'positive' | 'negative' | 'neutral';
}

export interface Resources {
  wood: number;
  stone: number;
  food: number;
  gold: number;
}

export interface PopulationHistoryPoint {
  tick: number;
  year: number;
  grass: number;
  rabbits: number;
  deer: number;
  wolves: number;
  foxes: number;
  humans: number;
  werewolves: number;
  wildkin: number;
  buildings: number;
}

/** Denormalized wildlife counts — updated each tick for UI without scanning entities. */
export interface WildlifeCounts {
  grass: number;
  rabbits: number;
  deer: number;
  wolves: number;
  foxes: number;
  werewolves: number;
  wildkin: number;
  trees: number;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  targetYear?: number;
  targetPopulation?: number;
  targetBuildings?: number;
  reward?: Resources;
  rewardText?: string;
}

export interface ResearchCompletionNotify {
  title: string;
  message: string;
  level?: 'info' | 'success' | 'warning';
}

export interface ResearchNode {
  id: string;
  type: ResearchType;
  name: string;
  description: string;
  cost: Resources;
  unlocked: boolean;
  researched: boolean;
  prerequisites: string[];
  effects: ResearchEffect[];
  icon: string;
  tier: number;
  /** Optional toast when this tech finishes researching. */
  completionNotify?: ResearchCompletionNotify;
  /** Show Blacksmith forge queue hint on complete (iron gear techs). */
  forgeUnlockNotify?: boolean;
}

export interface ResearchEffect {
  target: string;
  multiplier?: number;
  add?: number;
  replaces?: string;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  targetX: number;
  targetY: number;
  targetZoom: number;
}

export type VictoryPath = 'eco_utopia' | 'trade_empire' | 'great_city' | 'harmony';

export interface VictoryProgress {
  path: VictoryPath;
  label: string;
  description: string;
  progress: number;
  achieved: boolean;
}

export type ElectionCeremonyPhase = 'gathering' | 'gossip' | 'tension' | 'reveal';

export interface ElectionCeremonyState {
  phase: ElectionCeremonyPhase;
  phaseTicksLeft: number;
  gatherX: number;
  gatherY: number;
  reason: 'founding' | 'decennial' | 'succession';
  pendingLeaderId: number;
  pendingLeaderName: string;
  pendingChanged: boolean;
}

/** Pure simulation state — no camera, selection, or UI presentation fields. */
export interface WorldState {
  entities: Entity[];
  buildings: Building[];
  deathParticles: DeathParticle[];
  floatingTexts: FloatingText[];
  tick: number;
  season: Season;
  year: number;
  dayInYear: number;
  populationHistory: PopulationHistoryPoint[];
  width: number;
  height: number;
  nextEntityId: number;
  nextBuildingId: number;
  nextFloatingTextId: number;
  paused: boolean;
  speed: number;
  activeEvent: GameEvent | null;
  lastEventYear: number;
  bountifulHarvest: boolean;
  humanPopulation: number;
  maxHumanPopulation: number;
  wildlifeCounts: WildlifeCounts;
  villageName: string;
  villageReputation: number;
  resources: Resources;
  storageMax: Resources;
  foodSpoilageRate: number;
  ecosystemHealth: number;
  biodiversityIndex: number;
  pollutionLevel: number;
  challenges: Challenge[];
  autoSave: boolean;
  weather: WeatherType;
  weatherTimer: number;
  researchNodes: ResearchNode[];
  unlockedTechs: string[];
  activeResearch: string | null;
  researchProgress: number;
  soundEnabled: boolean;
  musicEnabled: boolean;
  notifications: GameNotification[];
  bigNews: BigNewsItem[];
  /** Transient impulse from sim events; synced to ViewState.screenShake each tick. */
  screenShakeImpulse: number;
  disasters: Disaster[];
  tradeRoutes: TradeRoute[];
  totalBuildingsCompleted: number;
  /** Last absolute calendar day daily sim events ran (prevents reload double-fire). */
  lastProcessedCalendarDay?: number;
  worldMap: WorldMap | null;
  yearlyStats: import('./stats').YearlyStats[];
  lifetimeStats: import('./stats').LifetimeStats;
  eventLog: GameEventLog[];
  festival: { active: boolean; name: string; daysLeft: number } | null;
  /** Tick after which the player can host another Town Hall festival. */
  townHallFestivalCooldownUntilTick?: number;
  visitorGroups: VisitorGroup[];
  rivalSettlements: RivalSettlement[];
  /** Rival diplomacy events awaiting a player response (v0.4.1). */
  pendingDiplomacyEvents: DiplomacyEvent[];
  /** Incoming raids — defend, barricade, or pay off. */
  pendingRaidEvents: import('./frontierCombat').RaidEvent[];
  /** Outgoing raids — rival may offer tribute or fight when your war-band arrives. */
  pendingOutgoingRaidEvents: import('./frontierCombat').OutgoingRaidEvent[];
  /** Rare night-sky easter egg */
  renffrOmen?: import('./renffrStar').RenffrOmen | null;
  /** Settlers gossip about Renffr until this tick (after a night omen). */
  renffrChatterUntilTick?: number;
  victories: VictoryProgress[];
  victoryAchieved: VictoryPath | null;
  ecoHealthYearsAbove80: number;
  /** Guaranteed friendly caravan in the first in-game week (v0.4.1). */
  firstWeekVisitorSpawned: boolean;
  /** Elected village head (player settler entity id). */
  villageLeaderId: number | null;
  /** Year the current leader's term began. */
  leaderSinceYear: number;
  /** Last year a founding or decennial election was held. */
  lastElectionYear: number;
  /** Merit election scheduled after leader vacancy (Year N = election year). */
  pendingElectionYear: number | null;
  /** Year-start buildup notification sent (election next year). */
  electionBuildupNotifiedYear: number | null;
  /** Multi-phase election day ceremony (decennial). */
  electionCeremony: ElectionCeremonyState | null;
  /** Blacksmith forge queue — iron gear requires research + forging. */
  villageForge: import('./forge').VillageForgeState;
  /** Contextual tutorial tips already shown this playthrough. */
  tutorialSeen?: string[];
  /** Colony day of last wildlife replenish event-log entry (throttles meadow spam). */
  lastWildlifeReplenishLogDay?: number;
  /** Ephemeral predator scent field — rebuilt each session, not saved. */
  scentGrid?: import('./scentGrid').ScentGrid;
  /** Alive entities by type — rebuilt each sim tick for render/UI; not saved. */
  entityByType?: EntityByType;
  /** Grass spatial index — rebuilt each sim tick for graze + render; not saved. */
  grassGrid?: import('./spatialGrid').EntitySpatialGrid;
  /** Mobile spatial index — rebuilt each sim tick for hunt/flee/social queries; not saved. */
  mobileGrid?: import('./spatialGrid').EntitySpatialGrid;
  /** Tree spatial index — rebuilt when alive tree count changes; not saved. */
  treeGrid?: import('./spatialGrid').EntitySpatialGrid;
  treeGridAlive?: number;
  /** Road avoidance index — rebuilt when completed road count changes; not saved. */
  roadAvoidance?: import('./spatialGrid').RoadAvoidanceIndex;
  roadAvoidanceStamp?: number;
  /** World-event titles fired during the current calendar year (flushed into YearlyStats). */
  eventsThisYear?: string[];
  /** Save migration ids already applied — avoids scanning event log on every load. */
  appliedSaveMigrations?: string[];
}

/** @deprecated Use WorldState for simulation and ViewState for presentation. */
export type GameState = WorldState;

export type CombatLogKind = 'incoming_raid' | 'outgoing_raid' | 'defense' | 'repelled';

export interface GameEventLog {
  id: number;
  tick: number;
  year: number;
  day: number;
  type: 'birth' | 'death' | 'marriage' | 'scandal' | 'building' | 'disaster' | 'research' | 'trade' | 'migration' | 'season' | 'event' | 'combat';
  message: string;
  entityName?: string;
  combatKind?: CombatLogKind;
}

export interface GameNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'event';
  createdAt: number;
}

export interface BigNewsItem {
  id: string;
  title: string;
  message: string;
  type: 'positive' | 'negative' | 'neutral';
  createdAt: number;
  dismissed: boolean;
}

export interface Disaster {
  type: 'fire' | 'flood' | 'plague' | 'tornado' | 'earthquake';
  x: number;
  y: number;
  radius: number;
  duration: number;
  progress: number;
}

export interface TradeRoute {
  id: string;
  targetName: string;
  resourcesGiven: Resources;
  resourcesReceived: Resources;
  reputationRequired: number;
  active: boolean;
  /** Partner settlement on the map edge — caravans walk here and back. */
  partnerX?: number;
  partnerY?: number;
  caravanCarrierId?: number;
  caravanLeg?: 'outbound' | 'at_partner' | 'inbound';
  caravanWaitTicks?: number;
  nextDepartureTick?: number;
  caravansCompleted?: number;
}

export interface BuildingConfig {
  width: number;
  height: number;
  cost: { wood: number; stone: number; gold: number };
  /** Calendar days of on-site work (7am–7pm) for one builder to finish. */
  buildTime: number;
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
    emoji: '🌾', label: 'Mill', description: 'Processes grain, boosting all food production.',
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
    emoji: '🏫', label: 'School', description: 'Staff a teacher — children attend by day for faster growth & graduation perks.',
    sprite: '/sprites/school.png', backgroundColor: '#2563eb', padShape: 'round',
    unlockRequirement: 'education_1',
  },
  [BuildingType.Hospital]: {
    width: 53, height: 46,
    cost: { wood: 40, stone: 40, gold: 50 },
    buildTime: 6, maxOccupants: 2,
    emoji: '🏥', label: 'Hospital', description: 'Staffed hospital adds reputation and lowers energy drain.',
    sprite: '/sprites/hospital.png', backgroundColor: '#db2777', padShape: 'round',
    unlockRequirement: 'medicine_1',
  },
  [BuildingType.TownHall]: {
    width: 63, height: 53,
    cost: { wood: 100, stone: 80, gold: 100 },
    buildTime: 8, maxOccupants: 3,
    emoji: '🏰', label: 'Town Hall', description: 'Civic hub — taxes, trade, immigration, elections & festivals when staffed.',
    sprite: '/sprites/townhall.png', backgroundColor: '#1d4ed8', padShape: 'round',
    unlockRequirement: 'architecture_2',
  },
  [BuildingType.Church]: {
    width: 50, height: 56,
    cost: { wood: 45, stone: 35, gold: 20 },
    buildTime: 4, maxOccupants: 1,
    emoji: '⛪', label: 'Church', description: 'Staffed church boosts courtship, may break Moon Howler curses at dawn after full-moon hunts, and catches affairs.',
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
    emoji: '🏯', label: 'Mansion', description: 'Large family home (up to 8). Attracts more immigrants.',
    sprite: '/sprites/mansion.png', backgroundColor: '#b45309', padShape: 'round',
    unlockRequirement: 'architecture_1',
  },
  [BuildingType.Prison]: {
    width: 50, height: 46,
    cost: { wood: 60, stone: 40, gold: 30 },
    buildTime: 5, maxOccupants: 2,
    emoji: '⛓️', label: 'Prison', description: 'Holds scandalous settlers for a short sentence. Requires a Guard.',
    sprite: '/sprites/prison.png', backgroundColor: '#475569', padShape: 'rect',
    unlockRequirement: 'architecture_1',  },
  [BuildingType.TamingPost]: {
    width: 43, height: 43,
    cost: { wood: 35, stone: 15, gold: 20 },    buildTime: 3, maxOccupants: 1,
    emoji: '🦴', label: 'Taming Post', description: 'Allows settlers to tame nearby wolves, foxes, deer, and rabbits.',
    sprite: '/sprites/wolf.png', backgroundColor: '#7c3aed', padShape: 'circle',
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
};

export const INITIAL_CHALLENGES: Challenge[] = [
  { id: 'first_settlers', title: 'First Settlers', description: 'Build a house and reach a population of 5 humans.', completed: false, targetPopulation: 5, reward: { wood: 50, stone: 20, food: 30, gold: 20 }, rewardText: '+50 wood, +20 stone, +30 food, +20 gold' },
  { id: 'growing_village', title: 'Growing Village', description: 'Reach Year 5 with at least 5 completed buildings.', completed: false, targetYear: 5, targetBuildings: 5, reward: { wood: 100, stone: 50, food: 50, gold: 40 }, rewardText: '+100 wood, +50 stone, +50 food, +40 gold' },
  { id: 'thriving_town', title: 'Thriving Town', description: 'Reach a population of 50 humans.', completed: false, targetPopulation: 50, reward: { wood: 200, stone: 100, food: 100, gold: 100 }, rewardText: '+200 wood, +100 stone, +100 food, +100 gold' },
  { id: 'century', title: 'Century Mark', description: 'Survive for 100 years.', completed: false, targetYear: 100, reward: { wood: 500, stone: 500, food: 500, gold: 500 }, rewardText: '+500 all resources!' },
  { id: 'eco_master', title: 'Eco Master', description: 'Maintain ecosystem health above 80% for 10 years.', completed: false, reward: { wood: 150, stone: 100, food: 200, gold: 100 }, rewardText: '+150 wood, +100 stone, +200 food, +100 gold' },
  { id: 'tech_pioneer', title: 'Tech Pioneer', description: 'Research 5 technologies.', completed: false, reward: { wood: 100, stone: 100, food: 0, gold: 200 }, rewardText: '+100 wood, +100 stone, +200 gold' },
  { id: 'trading_hub', title: 'Trading Hub', description: 'Establish 3 trade routes.', completed: false, reward: { wood: 0, stone: 0, food: 0, gold: 300 }, rewardText: '+300 gold' },
  { id: 'great_city', title: 'Great City', description: 'Reach a population of 250 humans with 35 buildings.', completed: false, targetPopulation: 250, targetBuildings: 35, reward: { wood: 1000, stone: 1000, food: 1000, gold: 1000 }, rewardText: '+1000 all resources!' },
];

export function createInitialResearchNodes(): ResearchNode[] {
  return [
    { id: 'agriculture_1', type: ResearchType.Agriculture, name: 'Advanced Farming', description: 'Unlocks Greenhouse', cost: { wood: 50, stone: 20, food: 0, gold: 30 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'farm_yield', multiplier: 1.2 }], icon: '🌾', tier: 1 },
    { id: 'agriculture_2', type: ResearchType.Agriculture, name: 'Grain Processing', description: 'Unlocks Mill', cost: { wood: 80, stone: 40, food: 0, gold: 60 }, unlocked: false, researched: false, prerequisites: ['agriculture_1'], effects: [{ target: 'all_food', multiplier: 1.25 }], icon: '🌾', tier: 2 },
    { id: 'agriculture_3', type: ResearchType.Agriculture, name: 'Irrigation', description: 'Farms work 50% better in drought', cost: { wood: 60, stone: 60, food: 0, gold: 80 }, unlocked: false, researched: false, prerequisites: ['agriculture_2'], effects: [{ target: 'drought_resist', multiplier: 1.5 }], icon: '💧', tier: 3 },
    { id: 'mining_1', type: ResearchType.Mining, name: 'Deep Mining', description: 'Unlocks Mine', cost: { wood: 60, stone: 30, food: 0, gold: 40 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'quarry_yield', multiplier: 1.2 }], icon: '⛏️', tier: 1 },
    { id: 'mining_2', type: ResearchType.Mining, name: 'Refining', description: 'Stone production +30% · unlocks Iron Pickaxes forge order at Blacksmith', cost: { wood: 80, stone: 50, food: 0, gold: 70 }, unlocked: false, researched: false, prerequisites: ['mining_1'], effects: [{ target: 'stone_production', multiplier: 1.3 }], icon: '⚒️', tier: 2 },
    { id: 'forestry_1', type: ResearchType.Forestry, name: 'Carpentry', description: 'Unlocks Blacksmith', cost: { wood: 40, stone: 30, food: 0, gold: 35 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'lumber_yield', multiplier: 1.2 }], icon: '🪵', tier: 1 },
    { id: 'forestry_2', type: ResearchType.Forestry, name: 'Sustainable Logging', description: 'Reduces pollution from lumber', cost: { wood: 70, stone: 40, food: 0, gold: 60 }, unlocked: false, researched: false, prerequisites: ['forestry_1'], effects: [{ target: 'lumber_pollution', multiplier: 0.5 }], icon: '🌲', tier: 2 },
    { id: 'architecture_1', type: ResearchType.Architecture, name: 'Fine Construction', description: 'Unlocks Mansion · step 1 toward Town Hall', cost: { wood: 80, stone: 60, food: 0, gold: 50 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'building_health', multiplier: 1.3 }], icon: '🏗️', tier: 1 },
    { id: 'architecture_2', type: ResearchType.Architecture, name: 'Urban Planning', description: 'Unlocks Town Hall (+ reputation from roads)', cost: { wood: 100, stone: 80, food: 0, gold: 100 }, unlocked: false, researched: false, prerequisites: ['architecture_1'], effects: [{ target: 'road_bonus', multiplier: 1.5 }], icon: '🏛️', tier: 2, completionNotify: { title: 'Town Hall unlocked', message: 'Open Build (B) → Community → Town Hall 🏰', level: 'success' } },
    { id: 'medicine_1', type: ResearchType.Medicine, name: 'Herbal Medicine', description: 'Unlocks Hospital', cost: { wood: 50, stone: 40, food: 0, gold: 60 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'human_lifespan', multiplier: 1.2 }], icon: '🌿', tier: 1 },
    { id: 'medicine_2', type: ResearchType.Medicine, name: 'Plague Resistance', description: 'Immune to plague disasters', cost: { wood: 60, stone: 50, food: 0, gold: 90 }, unlocked: false, researched: false, prerequisites: ['medicine_1'], effects: [{ target: 'plague_immunity', add: 1 }], icon: '💉', tier: 2 },
    { id: 'trade_1', type: ResearchType.Trade, name: 'Commerce', description: 'Unlocks Market', cost: { wood: 60, stone: 30, food: 0, gold: 50 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'gold_production', multiplier: 1.2 }], icon: '💰', tier: 1 },
    { id: 'trade_2', type: ResearchType.Trade, name: 'Trade Routes', description: 'Enables trade routes', cost: { wood: 80, stone: 40, food: 0, gold: 100 }, unlocked: false, researched: false, prerequisites: ['trade_1'], effects: [{ target: 'trade_bonus', multiplier: 1.5 }], icon: '🚢', tier: 2 },
    { id: 'education_1', type: ResearchType.Education, name: 'Scholarship', description: 'Unlocks School', cost: { wood: 70, stone: 50, food: 0, gold: 40 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'research_speed', multiplier: 1.3 }], icon: '📚', tier: 1 },
    { id: 'education_2', type: ResearchType.Education, name: 'Advanced Learning', description: 'All buildings 20% more efficient', cost: { wood: 90, stone: 70, food: 0, gold: 120 }, unlocked: false, researched: false, prerequisites: ['education_1'], effects: [{ target: 'global_efficiency', multiplier: 1.2 }], icon: '🎓', tier: 2 },
    { id: 'defense_1', type: ResearchType.Defense, name: 'Fortification', description: 'Unlocks walls & watchtower · buildings take 50% less disaster damage', cost: { wood: 100, stone: 80, food: 0, gold: 70 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'disaster_resist', multiplier: 0.5 }], icon: '🛡️', tier: 1 },
    { id: 'defense_2', type: ResearchType.Defense, name: 'Stone Spears', description: 'Unlocks Barracks · settlers hunt farther (+20% range) and bring home more meat (+25% food)', cost: { wood: 40, stone: 25, food: 0, gold: 20 }, unlocked: false, researched: false, prerequisites: ['defense_1'], effects: [{ target: 'hunt_range', multiplier: 1.2 }, { target: 'hunt_food', multiplier: 1.25 }], icon: '🏹', tier: 2 },
    { id: 'defense_3', type: ResearchType.Defense, name: 'Wooden Shields', description: 'Settlers block 35% of Moon Howler strikes and flee faster', cost: { wood: 60, stone: 20, food: 0, gold: 35 }, unlocked: false, researched: false, prerequisites: ['defense_1'], effects: [{ target: 'predator_block', add: 0.35 }, { target: 'flee_speed', multiplier: 1.2 }], icon: '🛡️', tier: 2 },
    { id: 'defense_4', type: ResearchType.Defense, name: 'Iron Spears', description: 'Unlocks iron spear forge order at Blacksmith — +40% hunt range, fight back vs wolves', cost: { wood: 70, stone: 50, food: 0, gold: 80 }, unlocked: false, researched: false, prerequisites: ['defense_2', 'mining_1'], effects: [{ target: 'hunt_range', multiplier: 1.4 }, { target: 'hunt_food', multiplier: 1.3 }, { target: 'counter_attack', add: 0.45 }], icon: '⚔️', tier: 3, forgeUnlockNotify: true },
    { id: 'defense_5', type: ResearchType.Defense, name: 'Iron Shields', description: 'Unlocks iron shield forge order at Blacksmith — block 60% of predator kills', cost: { wood: 80, stone: 60, food: 0, gold: 90 }, unlocked: false, researched: false, prerequisites: ['defense_3', 'mining_1'], effects: [{ target: 'predator_block', add: 0.6 }, { target: 'flee_speed', multiplier: 1.35 }], icon: '🛡️', tier: 3, forgeUnlockNotify: true },
    { id: 'defense_6', type: ResearchType.Defense, name: 'Militia Drill', description: 'Unlocks Guard Halberds forge order — +6 militia per staffed barracks guard', cost: { wood: 90, stone: 55, food: 0, gold: 100 }, unlocked: false, researched: false, prerequisites: ['defense_4'], effects: [], icon: '🪖', tier: 4 },
    { id: 'defense_7', type: ResearchType.Defense, name: 'Reinforced Masonry', description: 'Unlocks Reinforced Wall Plates forge order — +4 barricade per wall segment', cost: { wood: 100, stone: 90, food: 0, gold: 110 }, unlocked: false, researched: false, prerequisites: ['defense_5', 'defense_1'], effects: [], icon: '🧱', tier: 4 },
  ];
}

export const TerrainType = {
  DeepWater: 'deepWater',
  ShallowWater: 'shallowWater',
  River: 'river',
  RiverBank: 'riverBank',
  Beach: 'beach',
  Grassland: 'grassland',
  Forest: 'forest',
  DarkForest: 'darkForest',
  Hills: 'hills',
  Mountains: 'mountains',
  Rocky: 'rocky',
  Snow: 'snow',
} as const;
export type TerrainType = (typeof TerrainType)[keyof typeof TerrainType];

export interface TerrainTile {
  type: TerrainType;
  elevation: number; // 0-100
  moisture: number;  // 0-100
  variation: number; // random offset for visual variety
}

export const MapPreset = {
  Verdant: 'verdant',
  Mountainous: 'mountainous',
  Coastal: 'coastal',
  Arid: 'arid',
  Harsh: 'harsh',
} as const;
export type MapPreset = (typeof MapPreset)[keyof typeof MapPreset];

export const MapSize = {
  Small: 'small',
  Medium: 'medium',
  Large: 'large',
} as const;
export type MapSize = (typeof MapSize)[keyof typeof MapSize];

export const MAP_SIZE_DIMENSIONS: Record<MapSize, { width: number; height: number }> = {
  [MapSize.Small]: { width: 800, height: 600 },
  [MapSize.Medium]: { width: 1200, height: 900 },
  [MapSize.Large]: { width: 1600, height: 1200 },
};

export interface WorldMap {
  tiles: TerrainTile[][];
  width: number;
  height: number;
  seed: number;
  rivers: { x: number; y: number }[][];
  preset: MapPreset;
  size: MapSize;
}

export const GRID_SIZE = 20;
export const GRID_SNAP = true;

export function snapToGrid(value: number, gridSize: number = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

export { GAME_VERSION, GAME_PHASE, GAME_TITLE, GAME_SUBTITLE } from './version';

export const WEREWOLF_CURSE_LINES = [
  (name: string) => `${name} was touched by the full moon. They seem fine… for now.`,
  (name: string) => `${name} now bears the Moon Howler curse. Keep them home on full moons.`,
  (name: string) => `${name} heard the moon call once. It remembered their address.`,
  (name: string) => `The valley whispers that ${name} won't stay human on full moons.`,
] as const;

export const WEREWOLF_TRANSFORM_LINES = [
  (name: string) => `Full moon rise — ${name} is abroad and hungry.`,
  (name: string) => `${name} shed their boots. The village should lock its doors.`,
  (name: string) => `${name} is no longer asking permission to hunt.`,
  (name: string) => `Moonlight took ${name}. Pray they don't find the lane.`,
] as const;

export const WEREWOLF_ATTACK_LINES = [
  (wolf: string, victim: string) => `${wolf} tore into ${victim} beneath the full moon.`,
  (wolf: string, victim: string) => `${victim} didn't outrun ${wolf}. The night won.`,
  (wolf: string, victim: string) => `${wolf} left the village mourning ${victim}.`,
] as const;

export const WEREWOLF_CURE_LINES = [
  'The Church lifted the curse. Trousers restored, teeth filed down.',
  'Sermon held. The Moon Howler curse is broken.',
  'Holy water, hymn #3, and a stern look — cured.',
  'They woke human again. The moon will have to try harder.',
] as const;

export const WEREWOLF_HOWL_LINES = [
  'AWOO!',
  'Run!',
  'Mine!',
  'Hungry!',
  'Closer…',
  'No escape!',
] as const;

export const WEREWOLF_BEFRIEND_LINES = [
  (human: string, wolf: string) => `${human} offered snacks. ${wolf} accepted friendship.`,
  (human: string, wolf: string) => `${human} and ${wolf} signed a howling waiver.`,
  (human: string, wolf: string) => `${wolf} now follows ${human} on a leash of mutual respect.`,
  (human: string, wolf: string) => `${human} said "nice fur." ${wolf} said "deal."`,
] as const;

export const WEREWOLF_TAME_LINES: readonly string[] = [...WEREWOLF_CURE_LINES];

export const ECOLOGICAL_FACTS = [
  'Apex predators like wolves help regulate prey populations and maintain ecosystem balance.',
  'Biodiversity hotspots often contain species found nowhere else on Earth.',
  'Grasslands store carbon in their deep root systems.',
  'Keystone species have a disproportionate impact on their environment.',
  'Habitat fragmentation can isolate populations and reduce genetic diversity.',
  'Seasonal changes drive migration, reproduction, and food availability.',
  'Wetlands act as natural water filters and flood protectors.',
  'Beavers are ecosystem engineers that create habitats for hundreds of species.',
  'Mycorrhizal fungi connect trees in a "wood wide web" of nutrient exchange.',
  'Coral reefs support 25% of all marine species despite covering less than 1% of the ocean floor.',
  'Moon Howlers are cursed villagers — human by day, deadly on full-moon nights about every 2 weeks.',
  'Uncured Moon Howlers transform every 14 days; a staffed Church may exorcise them at dawn while still in 🌝 form (~18% roll, village-wide).',
];

export interface WeatherConfig {
  label: string;
  emoji: string;
  color: string;
  particleCount: number;
  /** Full-screen tint alpha (fog/drought); 0 for particle-only weather. */
  overlayAlpha: number;
}

export const WEATHER_CONFIGS: Record<WeatherType, WeatherConfig> = {
  [WeatherType.Clear]: { label: 'Clear', emoji: '', color: '', particleCount: 0, overlayAlpha: 0 },
  [WeatherType.Rain]: { label: 'Rain', emoji: '🌧️', color: '#8a9aaa', particleCount: 40, overlayAlpha: 0 },
  [WeatherType.Snow]: { label: 'Snow', emoji: '❄️', color: '#ffffff', particleCount: 25, overlayAlpha: 0 },
  [WeatherType.Storm]: { label: 'Storm', emoji: '⛈️', color: '#90a0b0', particleCount: 50, overlayAlpha: 0 },
  [WeatherType.Fog]: { label: 'Fog', emoji: '🌫️', color: '#d1d5db', particleCount: 0, overlayAlpha: 0.2 },
  [WeatherType.Drought]: { label: 'Drought', emoji: '🌵', color: '#92400e', particleCount: 0, overlayAlpha: 0.06 },
};
