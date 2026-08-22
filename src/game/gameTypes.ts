// Entity types as const object
import type { Resources, ResourceKey } from './resourceTypes';
import type { ValleyStage } from './ecologyTypes';
import type { YearlyStats, LifetimeStats } from './stats';
import type { ScentGrid } from './scentGrid';
import type { EntitySpatialGrid, RoadAvoidanceIndex } from './spatialGrid';
import type { AdjacencyIndex } from './adjacencyIndex';
import { BuildingType } from './buildings';
import type { Building } from './buildings';
import type { Challenge } from './challenges';

export { BuildingType, BUILDING_CONFIGS } from './buildings';
export type { Building, BuildingConfig, StaffingMode } from './buildings';
export { HUNTING_SPOT_PREY_OPTIONS } from './huntingSpots';
export type { HuntingSpotPrey } from './huntingSpots';
export { WORKSHOP_RECIPES, DEFAULT_WORKSHOP_RECIPE_ID, getWorkshopRecipe, formatRecipeInputs } from './workshops';
export type { WorkshopRecipe } from './workshops';
export type { Challenge } from './challenges';

/** One letter of the Renffr sky omen (see renffrStar). */
export interface RenffrLetter {
  char: string;
  nx: number;
  ny: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
}

/** Transient sky omen state — lives on WorldState.renffrOmen while active. */
export interface RenffrOmen {
  life: number;
  maxLife: number;
  phase: number;
  phaseTimer: number;
  streakT: number;
  letters: RenffrLetter[];
}

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
  /** @deprecated Legacy saves only; new assignments use Soldier or PrisonGuard. */
  Guard: 'guard',
  Soldier: 'soldier',
  PrisonGuard: 'prison_guard',
  Innkeeper: 'innkeeper',
  Hotelier: 'hotelier',
} as const;
export type JobType = (typeof JobType)[keyof typeof JobType];

/** Personality trait ids for settlers (catalog + behavior in settlerTraits.ts). */
export type SettlerTrait =
  | 'hardy'
  | 'brave'
  | 'gregarious'
  | 'timid'
  | 'greenthumb'
  | 'lucky'
  | 'nurturing'
  | 'insightful'
  | 'chivalrous'
  | 'resourceful'
  | 'stoic'
  | 'graceful'
  | 'intuitive'
  | 'fierce';

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
  /** @deprecated Displayed only for unmigrated legacy assignments. */
  [JobType.Guard]: 'Guard (legacy)',
  [JobType.Soldier]: 'Soldier',
  [JobType.PrisonGuard]: 'Prison Guard',
  [JobType.Innkeeper]: 'Innkeeper',
  [JobType.Hotelier]: 'Hotelier',
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
  [BuildingType.Prison]: JobType.PrisonGuard,
  [BuildingType.Barracks]: JobType.Soldier,
  [BuildingType.HuntingSpot]: JobType.Hunter,
  [BuildingType.FishingSpot]: JobType.Hunter,
  [BuildingType.Tavern]: JobType.Innkeeper,
  [BuildingType.Hotel]: JobType.Hotelier,
};

/** Max visitor guests who can sleep at one staffed hotel overnight. */
export const HOTEL_GUEST_CAPACITY = 4;

/**
 * Occupation string of the sitting village leader — no workplace, no auto-assign
 * (leading is the job; family members keep normal occupations). See leaderHouse.ts.
 */
export const LEADER_OCCUPATION = 'leader';

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
  /** Ordinary/venue work ticks accumulated for the current colony day. */
  scheduleWorkedTicksToday?: number;
  /** Bounded carry-over fatigue from prior schedule days (0–100). */
  scheduleFatigue?: number;
  /** Set on graduation — grants skills, stamina, and village research bonus. */
  educated?: boolean;
  /** Personality traits (settler only) — subtle behavioral modifiers. */
  traits?: SettlerTrait[];
  pregnant?: boolean;
  pregnancyProgress?: number;
  /** Per-pregnancy term target (progress at which birth fires) — varies per conception. */
  pregnancyDueProgress?: number;
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
  /** Optional for non-human entities (animals, trees, etc.). */
  skills?: Partial<Record<JobType, number>>;
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
  /** After a partner dies — mourn until this tick (stay home, soft chat). */
  griefUntilTick?: number;
  lastMetPartner?: number;
  /** Current mutual courtship partner before marriage; used for relationship feedback. */
  courtshipPartnerId?: number;
  courtshipProgress?: number;
  /** Mutual adolescent sweetheart (ages 14–17); never creates a marriage or household. */
  youthLovePartnerId?: number;
  /** Slow daily attachment score for the current youth-love pair. */
  youthLoveProgress?: number;
  /** Absolute colony day on which the current youth-love pair began. */
  youthLoveStartedDay?: number;
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
  /** Optional for non-human entities. Spawn utilities should default to `[]`. */
  childrenIds?: number[];
  /** Rare static tree resource; blueberry trees remain ordinary `EntityType.Tree` entries. */
  forageKind?: 'blueberry';
  /** Remaining ripe blueberry portions (0–6) on a blueberry tree. */
  blueberryYield?: number;
  /** Absolute colony day on which one blueberry portion may regrow. */
  blueberryNextRegrowthDay?: number;
  /** Transient nearby blueberry-tree target for a free-time player settler. */
  blueberryForageTargetId?: number;
  name?: string;
  surname?: string;
  /** Honorific earned for deeds — e.g. "Moonslayer" (killed a Moon Howler) or "Howlerbane" (broke a curse). */
  title?: string;
  /** Autumn-migration herd membership (deer only) — which year's herd this deer belongs to. */
  migrationTag?: number;
  /** Colony day this child last let a family secret slip at school (transient per-day gate). */
  schoolGossipDay?: number;
  /** Colony day this child last formed a schoolyard bond (transient per-day gate). */
  schoolBondDay?: number;
  /** Childhood friends from school — their bonds nudge adult courtship. */
  childhoodFriendsIds?: number[];
  /** Friendship bonds — key `friend_<entityId>` → 0..100 (Phase 7). */
  friendships?: Record<string, number>;
  /** Active feuds — key `feud_<entityId>` → 0..100 (Phase 7). */
  feuds?: Record<string, number>;
  /** Master this juvenile is apprenticed to (Phase 7). */
  apprenticeOfId?: number;
  /** Juvenile this master is teaching (Phase 7). */
  apprenticeId?: number;
  /** Birth / maiden surname — restored for the woman when a caught-affair marriage ends. */
  maidenSurname?: string;
  /** Optional for non-human entities. */
  generation?: number;
  // Visual
  /** Optional for non-human entities. */
  spriteAngle?: number;
  /** Optional for non-human entities. */
  animFrame?: number;
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
    /** Prison sentence snapshotted during full-moon hunt (live fields cleared). */
    prisonBuildingId?: number;
    prisonerUntilTick?: number;
    prisonSentenceCrime?: 'scandal';
    relationshipStatus?: 'single' | 'married' | 'expecting';
    partnerId?: number;
    affairPartnerId?: number;
    affairProgress?: number;
    courtshipProgress?: number;
    youthLovePartnerId?: number;
    youthLoveProgress?: number;
    youthLoveStartedDay?: number;
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
  /** Visitor lodging at a player Hotel (not staff occupants). */
  hotelStayBuildingId?: number;
  /** Tick until which the visitor remains checked in. */
  hotelStayUntilTick?: number;
  /** Prey or predator being chased — used for hunt lines in the renderer */
  huntTargetId?: number;
  /** Brief combat flash after a hunt, block, or counter-attack */
  combatTicks?: number;
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
  /** Gold the group carries — funds gifts & sell-trades, no minted gold. */
  gold?: number;
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
  /** Absolute expiry tick; optional for legacy saved diplomacy events. */
  expiresAtTick?: number;
}

export type RivalRelationship = 'friendly' | 'neutral' | 'competitive' | 'tense';
export type RivalTemperament = 'welcoming' | 'pragmatic' | 'ambitious' | 'warlike';
export type RivalPriority = 'food' | 'trade' | 'security' | 'shelter';

export interface RivalLedger {
  food: number;
  wood: number;
  gold: number;
  morale: number;
  recovery: number;
}

export type RivalDailyAction = 'recover' | 'gather' | 'trade' | 'fortify' | 'scout' | 'cool_down' | 'none';

export interface RivalProfile {
  temperament: RivalTemperament;
  priority: RivalPriority;
  ledger: RivalLedger;
  /** Bounded count of meaningful stance-changing contacts. */
  contactCount: number;
  /** Latest bounded daily action summary for player-facing feedback. */
  lastAction?: RivalDailyAction;
  lastActionDay?: number;
}

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
  /** Optional for legacy saves; normalized at read/creation boundaries. */
  profile?: RivalProfile;
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

export type { Resources, ResourceKey };

/**
 * One sample in `WorldState.populationHistory` (stats layer / charts).
 * Older saves may only have the core population fields — treat newer keys as optional when reading.
 */
export interface PopulationHistoryEntry {
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
  /** Calendar day in year (0–359). Added with stats-layer expansion. */
  day?: number;
  season?: Season;
  gold?: number;
  food?: number;
  wood?: number;
  stone?: number;
  pollution?: number;
  ecosystemHealth?: number;
  biodiversity?: number;
}

/** A player-facing choice on an authored story event. */
export interface StoryChoice {
  id: string;
  label: string;
  detail: string;
}

/** Authored cross-system story — a visible choice that ties sim systems together. */
export interface StoryEvent {
  id: string;
  emoji: string;
  title: string;
  description: string;
  choices: StoryChoice[];
  createdAtTick: number;
  expiresAtTick: number;
  /** Which authored story this resolves — keeps the responder data-driven-safe. */
  storyKey: 'welcome' | 'wolf_choice' | 'ranger_visit' | 'howler_rumor' | 'grief_beat' | 'winter_prep' | 'valley_debate' | 'children_shelter';
}

/** @deprecated Prefer PopulationHistoryEntry (same shape, richer optional fields). */
export type PopulationHistoryPoint = PopulationHistoryEntry;

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

export type ElectionCeremonyPhase = 'gathering' | 'gossip' | 'tension' | 'reveal';

export type ForgeOrderId =
  | 'iron_spears'
  | 'iron_shields'
  | 'guard_halberds'
  | 'wall_plates'
  | 'iron_pickaxes'
  | 'iron_swords'
  | 'scale_mail'
  | 'tower_ballistae';

export interface ForgeOrder {
  id: ForgeOrderId;
  label: string;
  emoji: string;
  description: string;
  techId: string;
  /** Other forge runs that must finish first. */
  requiresForge?: ForgeOrderId[];
  inputs: Partial<Resources>;
  /** Progress gained per staffed forge tick (3 ticks ≈ 6 in-game days). */
  progressPerTick: number;
}

export interface VillageForgeState {
  activeOrder: ForgeOrderId | null;
  progress: number;
  completed: Partial<Record<ForgeOrderId, boolean>>;
}

export interface RaidChoice {
  id: string;
  label: string;
  hint: string;
  cost?: Partial<Resources>;
}

export interface RaidLootBundle {
  food: number;
  wood: number;
  stone: number;
  gold: number;
}

export type OutgoingRaidRivalResponse = 'payoff_offer' | 'fight';

export interface RaidEvent {
  id: string;
  rivalId: string;
  rivalName: string;
  title: string;
  description: string;
  emoji: string;
  choices: RaidChoice[];
  createdAtTick: number;
  /** Tick when unanswered raid auto-resolves (distance-scaled march time). */
  expiresAtTick: number;
  /** Camp distance in tiles when the raid was declared. */
  marchDistanceTiles: number;
  attackerStrength: number;
  lootFood: number;
  lootGold: number;
  lootWood: number;
  lootStone: number;
}

/** Player war-band marching on a rival camp — rival may buy you off or fight. */
export interface OutgoingRaidEvent {
  id: string;
  rivalId: string;
  rivalName: string;
  title: string;
  description: string;
  emoji: string;
  choices: RaidChoice[];
  createdAtTick: number;
  expiresAtTick: number;
  marchDistanceTiles: number;
  /** Provisions already spent when the march began. */
  marchFoodCost: number;
  isCounterRaid: boolean;
  rivalResponse: OutgoingRaidRivalResponse;
  attackerStrength: number;
  defenderStrength: number;
  lootFood: number;
  lootGold: number;
  lootWood: number;
  lootStone: number;
}

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

/** Bow/arrow hunt FX — transient, not required in saves. */
export interface HuntVisual {
  id: string;
  hunterId: number;
  preyType: EntityType;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  startedAtTick: number;
  startedAtMs: number;
  success: boolean;
  foughtBack: boolean;
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
  populationHistory: PopulationHistoryEntry[];
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
  /** ⚠️ Denormalized — must stay in sync with `entities` each tick. */
  humanPopulation: number;
  /** ⚠️ Denormalized — must stay in sync with `entities` each tick. */
  maxHumanPopulation: number;
  /** ⚠️ Denormalized — must stay in sync with `entities` each tick. */
  wildlifeCounts: WildlifeCounts;
  /** ⚠️ Denormalized — must stay in sync with `entities` each tick. */
  workingSettlers: number;
  /** ⚠️ Denormalized — must stay in sync with `entities` each tick. */
  idleSettlers: number;
  villageName: string;
  /** Global ordinary weekday work window; absent legacy saves use 07:00–18:00. */
  workSchedule?: import('./workSchedule').WorkSchedule;
  /** Independent Tavern service window; legacy saves use the canonical default. */
  tavernSchedule?: import('./venueSchedule').VenueSchedule;
  /** Independent Hotel service window; legacy saves use the canonical default. */
  hotelSchedule?: import('./venueSchedule').VenueSchedule;
  villageReputation: number;
  resources: Resources;
  storageMax: Resources;
  foodSpoilageRate: number;
  ecosystemHealth: number;
  biodiversityIndex: number;
  pollutionLevel: number;
  /**
   * Escalating valley ecology stage (Stable → Collapse).
   * See ecologyStage.ts — information-first, effects scale with sustained stress.
   */
  valleyStage?: ValleyStage;
  /** Absolute colony day when current valleyStage was entered. */
  valleyStageSinceDay?: number;
  /** Consecutive days raw stress wanted a higher stage. */
  valleyRawStressStreakDays?: number;
  /** Consecutive days raw stress wanted a lower stage. */
  valleyRawCalmStreakDays?: number;
  /** Absolute day of last stage notification (cooldown). */
  valleyLastStageNotifyDay?: number;
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
  /** ⚠️ Denormalized — must stay in sync with `buildings` each tick. */
  totalBuildingsCompleted: number;
  /** Last absolute calendar day daily sim events ran (prevents reload double-fire). */
  lastProcessedCalendarDay?: number;
  /**
   * Winter heating result for the current colony day.
   * Set when wood is burned at day boundary; true outside winter.
   */
  villageCanHeat?: boolean;
  worldMap: WorldMap | null;
  /** Separate authored campaign progression; sandbox story events remain independent. */
  guidedCampaign?: import('./guidedCampaign').GuidedCampaignState;
  yearlyStats: YearlyStats[];
  lifetimeStats: LifetimeStats;
  eventLog: GameEventLog[];
  /** Valley Chronicle — ids of chapters already reached (sandbox story spine). */
  chronicleChapters?: string[];
  festival: { active: boolean; name: string; daysLeft: number } | null;
  /** Tick after which the player can host another Town Hall festival. */
  townHallFestivalCooldownUntilTick?: number;
  visitorGroups: VisitorGroup[];
  rivalSettlements: RivalSettlement[];
  /** Rival diplomacy events awaiting a player response (v0.4.1). */
  pendingDiplomacyEvents: DiplomacyEvent[];
  /** Incoming raids — defend, barricade, or pay off. */
  pendingRaidEvents: RaidEvent[];
  /** Authored cross-system story choices awaiting a response (v0.6.1+). */
  pendingStoryEvents?: StoryEvent[];
  /** Which authored stories have already been offered/resolved this world. */
  storyFlags?: Record<string, number>;
  /** Outgoing raids — rival may offer tribute or fight when your war-band arrives. */
  pendingOutgoingRaidEvents: OutgoingRaidEvent[];
  /** Rare night-sky easter egg */
  renffrOmen?: RenffrOmen | null;
  /** Settlers gossip about Renffr until this tick (after a night omen). */
  renffrChatterUntilTick?: number;
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
  villageForge?: VillageForgeState;
  /** Contextual tutorial tips already shown this playthrough. */
  tutorialSeen?: string[];
  /** Per-day food ledger (production vs consumption) for the Village tab. */
  economyLedger?: DailyEconomyLedger;
  /** One active visitor quest (traveling smith) — delivered via the quest card. */
  visitorQuest?: VisitorQuest;
  /** One player-facing Village Request; generation and resolution belong only to groupEvents.ts. */
  activeVillageRequest?: VillageRequest;
  /** Absolute calendar day before another Village Request can be offered. */
  villageRequestCooldownUntilDay?: number;
  /** Latest bounded request outcomes for save diagnostics and later history UI. */
  villageRequestHistory?: VillageRequestHistoryEntry[];
  /** The village head's election promise — fulfilled or broken before next vote. */
  leaderPromise?: LeaderPromise;
  /** Colony day of last wildlife replenish event-log entry (throttles meadow spam). */
  lastWildlifeReplenishLogDay?: number;
  /** Player-dismissed big-news ids (UI patch / worker sync). */
  dismissedBigNewsIds?: string[];
  /** Player-dismissed active-event ids (UI patch / worker sync). */
  dismissedActiveEventIds?: string[];
  /** Player-dismissed notification ids (UI patch / worker sync). */
  dismissedNotificationIds?: string[];
  /** Active hunt VFX — transient, not required in saves. */
  huntVisuals?: HuntVisual[];
  /**
   * Last sim tick a priest attempted a full-moon exorcism (rate-limit).
   * Transient — not required in saves.
   */
  lastMoonHowlerExorcismTick?: number;
  /** Transient — priests retreat to the Church until this tick after a fallen comrade. */
  moonHowlerPriestsFleeUntil?: number;
  /** Transient — the autumn deer herd currently in the valley (see migration). */
  activeMigration?: { herdYear: number; endDay: number; spawned: number };
  /** Memory across years — how big next autumn's herd will be (see migration). */
  migrationNextHerdSize?: number;
  /** Transient — neighborhood beauty tile grid (Phase 3.2, see beautyGrid). */
  beautyGrid?: import('./beautyGrid').BeautyGrid;
  /** Transient — 0–100 village happiness derived from beauty under settlers. */
  villageHappiness?: number;
  /** Ephemeral predator scent field — rebuilt each session, not saved. */
  scentGrid?: ScentGrid;
  /** Alive entities by type — rebuilt each sim tick for render/UI; not saved. */
  entityByType?: EntityByType;
  /** Grass spatial index — rebuilt each sim tick for graze + render; not saved. */
  grassGrid?: EntitySpatialGrid;
  /** Mobile spatial index — rebuilt each sim tick for hunt/flee/social queries; not saved. */
  mobileGrid?: EntitySpatialGrid;
  /** Living-humans-only grid for social radius queries (not persisted). */
  humanSocialGrid?: EntitySpatialGrid;
  /** Static tree spatial index — lazily rebuilt for the "visit a tree" leisure; not saved. */
  treeGrid?: EntitySpatialGrid;
  /** Road avoidance index — rebuilt when completed road layout changes; not saved. */
  roadAvoidance?: RoadAvoidanceIndex;
  /** `computeRoadLayoutStamp` fingerprint of completed roads; not saved. */
  roadAvoidanceStamp?: number;
  /** Barn/road/market adjacency index — event-driven insert/remove; not saved. */
  adjacency?: AdjacencyIndex;
  /** Alive entity lookup — persisted across ticks; pruned on death; not saved. */
  entityById?: Map<number, Entity>;
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
  type: 'birth' | 'death' | 'marriage' | 'scandal' | 'building' | 'disaster' | 'research' | 'trade' | 'migration' | 'season' | 'event' | 'combat' | 'milestone';
  message: string;
  entityName?: string;
  combatKind?: CombatLogKind;
}

/** Per-day economy counters — production vs consumption by source. */
export interface DailyEconomyLedger {
  /** Absolute calendar day the counters were collected on. */
  day: number;
  produced: Record<string, number>;
  consumed: Record<string, number>;
}

/** The village head's election promise — fulfilled or broken before the next vote. */
export interface LeaderPromise {
  goal: 'buildings' | 'food';
  /** Player-facing label, e.g. 'Finish 3 new buildings'. */
  label: string;
  target: number;
  /** Value at promise time (buildings completed or food stored). */
  startValue: number;
}

/** One active visitor quest (traveling smith etc.) — delivered via the quest card. */
export interface VisitorQuest {
  id: string;
  emoji: string;
  title: string;
  description: string;
  goalType: 'deliver';
  goalResource: 'wood' | 'stone' | 'food' | 'gold';
  goalAmount: number;
  progress: number;
  status: 'active' | 'completed' | 'failed';
  rewardGold: number;
  rewardReputation: number;
  /** Absolute calendar day after which the quest expires. */
  expiresDay: number;
}

/** One declared player choice on an active Village Request. */
export interface VillageRequestChoice {
  id: 'accept' | 'decline';
  label: string;
  detail: string;
}

/** A bounded daily offer that awaits one player command. */
export interface VillageRequest {
  id: string;
  kind: 'caravan_provisions';
  sourceVisitorGroupId: string;
  sourceName: string;
  emoji: string;
  title: string;
  description: string;
  choices: VillageRequestChoice[];
  createdDay: number;
  expiresDay: number;
}

/** Retained, bounded request outcome record for save diagnostics and future history UI. */
export interface VillageRequestHistoryEntry {
  id: string;
  kind: VillageRequest['kind'];
  sourceName: string;
  outcome: 'accepted' | 'declined' | 'expired';
  resolvedDay: number;
}

export interface GameNotification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'event';
  createdAt: number;
  /** World position the toast jumps to when clicked (optional). */
  focus?: { x: number; y: number };
  /** Visitor/rival camp key (e.g. `visitor:xxx`) to select when clicked (optional). */
  campKey?: string;
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

export function createInitialResearchNodes(): ResearchNode[] {
  return [
    { id: 'agriculture_1', type: ResearchType.Agriculture, name: 'Advanced Farming', description: 'Unlocks Greenhouse', cost: { wood: 50, stone: 20, food: 0, gold: 30, iron: 0 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'farm_yield', multiplier: 1.2 }], icon: '🌾', tier: 1 },
    { id: 'agriculture_2', type: ResearchType.Agriculture, name: 'Grain Processing', description: 'Unlocks Mill', cost: { wood: 80, stone: 40, food: 0, gold: 60, iron: 0 }, unlocked: false, researched: false, prerequisites: ['agriculture_1'], effects: [{ target: 'all_food', multiplier: 1.25 }], icon: '🌾', tier: 2 },
    { id: 'agriculture_3', type: ResearchType.Agriculture, name: 'Irrigation', description: 'Farms work 50% better in drought', cost: { wood: 60, stone: 60, food: 0, gold: 80, iron: 0 }, unlocked: false, researched: false, prerequisites: ['agriculture_2'], effects: [{ target: 'drought_resist', multiplier: 1.5 }], icon: '💧', tier: 3 },
    { id: 'mining_1', type: ResearchType.Mining, name: 'Deep Mining', description: 'Unlocks Mine', cost: { wood: 60, stone: 30, food: 0, gold: 40, iron: 0 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'quarry_yield', multiplier: 1.2 }], icon: '⛏️', tier: 1 },
    { id: 'mining_2', type: ResearchType.Mining, name: 'Refining', description: 'Stone production +30% · unlocks Iron Pickaxes forge order at Blacksmith', cost: { wood: 80, stone: 50, food: 0, gold: 70, iron: 0 }, unlocked: false, researched: false, prerequisites: ['mining_1'], effects: [{ target: 'stone_production', multiplier: 1.3 }], icon: '⚒️', tier: 2 },
    { id: 'forestry_1', type: ResearchType.Forestry, name: 'Carpentry', description: 'Unlocks Blacksmith', cost: { wood: 40, stone: 30, food: 0, gold: 35, iron: 0 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'lumber_yield', multiplier: 1.2 }], icon: '🪵', tier: 1 },
    { id: 'forestry_2', type: ResearchType.Forestry, name: 'Sustainable Logging', description: 'Reduces pollution from lumber', cost: { wood: 70, stone: 40, food: 0, gold: 60, iron: 0 }, unlocked: false, researched: false, prerequisites: ['forestry_1'], effects: [{ target: 'lumber_pollution', multiplier: 0.5 }], icon: '🌲', tier: 2 },
    { id: 'architecture_1', type: ResearchType.Architecture, name: 'Fine Construction', description: 'Unlocks Mansion · step 1 toward Town Hall', cost: { wood: 80, stone: 60, food: 0, gold: 50, iron: 0 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'building_health', multiplier: 1.3 }], icon: '🏗️', tier: 1 },
    { id: 'architecture_2', type: ResearchType.Architecture, name: 'Urban Planning', description: 'Unlocks Town Hall (+ reputation from roads)', cost: { wood: 100, stone: 80, food: 0, gold: 100, iron: 0 }, unlocked: false, researched: false, prerequisites: ['architecture_1'], effects: [{ target: 'road_bonus', multiplier: 1.5 }], icon: '🏛️', tier: 2, completionNotify: { title: 'Town Hall unlocked', message: 'Open Build (B) → Community → Town Hall 🏰', level: 'success' } },
    { id: 'medicine_1', type: ResearchType.Medicine, name: 'Herbal Medicine', description: 'Unlocks Hospital', cost: { wood: 50, stone: 40, food: 0, gold: 60, iron: 0 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'human_lifespan', multiplier: 1.2 }], icon: '🌿', tier: 1 },
    { id: 'medicine_2', type: ResearchType.Medicine, name: 'Plague Resistance', description: 'Immune to plague disasters', cost: { wood: 60, stone: 50, food: 0, gold: 90, iron: 0 }, unlocked: false, researched: false, prerequisites: ['medicine_1'], effects: [{ target: 'plague_immunity', add: 1 }], icon: '💉', tier: 2 },
    { id: 'trade_1', type: ResearchType.Trade, name: 'Commerce', description: 'Unlocks Market and Hotel', cost: { wood: 60, stone: 30, food: 0, gold: 50, iron: 0 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'gold_production', multiplier: 1.2 }], icon: '💰', tier: 1 },
    { id: 'trade_2', type: ResearchType.Trade, name: 'Trade Routes', description: 'Enables trade routes', cost: { wood: 80, stone: 40, food: 0, gold: 100, iron: 0 }, unlocked: false, researched: false, prerequisites: ['trade_1'], effects: [{ target: 'trade_bonus', multiplier: 1.5 }], icon: '🚢', tier: 2 },
    { id: 'education_1', type: ResearchType.Education, name: 'Scholarship', description: 'Unlocks School', cost: { wood: 70, stone: 50, food: 0, gold: 40, iron: 0 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'research_speed', multiplier: 1.3 }], icon: '📚', tier: 1 },
    { id: 'education_2', type: ResearchType.Education, name: 'Advanced Learning', description: 'All buildings 20% more efficient', cost: { wood: 90, stone: 70, food: 0, gold: 120, iron: 0 }, unlocked: false, researched: false, prerequisites: ['education_1'], effects: [{ target: 'global_efficiency', multiplier: 1.2 }], icon: '🎓', tier: 2 },
    { id: 'defense_1', type: ResearchType.Defense, name: 'Fortification', description: 'Unlocks walls & watchtower · buildings take 50% less disaster damage', cost: { wood: 100, stone: 80, food: 0, gold: 70, iron: 0 }, unlocked: true, researched: false, prerequisites: [], effects: [{ target: 'disaster_resist', multiplier: 0.5 }], icon: '🛡️', tier: 1 },
    { id: 'defense_2', type: ResearchType.Defense, name: 'Stone Spears', description: 'Unlocks Barracks · settlers hunt farther (+20% range) and bring home more meat (+25% food)', cost: { wood: 40, stone: 25, food: 0, gold: 20, iron: 0 }, unlocked: false, researched: false, prerequisites: ['defense_1'], effects: [{ target: 'hunt_range', multiplier: 1.2 }, { target: 'hunt_food', multiplier: 1.25 }], icon: '🏹', tier: 2 },
    { id: 'defense_3', type: ResearchType.Defense, name: 'Wooden Shields', description: 'Settlers block 35% of Moon Howler strikes and flee faster', cost: { wood: 60, stone: 20, food: 0, gold: 35, iron: 0 }, unlocked: false, researched: false, prerequisites: ['defense_1'], effects: [{ target: 'predator_block', add: 0.35 }, { target: 'flee_speed', multiplier: 1.2 }], icon: '🛡️', tier: 2 },
    { id: 'defense_4', type: ResearchType.Defense, name: 'Iron Spears', description: 'Unlocks iron spear forge order at Blacksmith — +40% hunt range, fight back vs wolves', cost: { wood: 70, stone: 50, food: 0, gold: 80, iron: 0 }, unlocked: false, researched: false, prerequisites: ['defense_2', 'mining_1'], effects: [{ target: 'hunt_range', multiplier: 1.4 }, { target: 'hunt_food', multiplier: 1.3 }, { target: 'counter_attack', add: 0.45 }], icon: '⚔️', tier: 3, forgeUnlockNotify: true },
    { id: 'defense_5', type: ResearchType.Defense, name: 'Iron Shields', description: 'Unlocks iron shield forge order at Blacksmith — block 60% of predator kills', cost: { wood: 80, stone: 60, food: 0, gold: 90, iron: 0 }, unlocked: false, researched: false, prerequisites: ['defense_3', 'mining_1'], effects: [{ target: 'predator_block', add: 0.6 }, { target: 'flee_speed', multiplier: 1.35 }], icon: '🛡️', tier: 3, forgeUnlockNotify: true },
    { id: 'defense_6', type: ResearchType.Defense, name: 'Militia Drill', description: 'Unlocks Guard Halberds forge order — +6 militia per staffed barracks guard', cost: { wood: 90, stone: 55, food: 0, gold: 100, iron: 0 }, unlocked: false, researched: false, prerequisites: ['defense_4'], effects: [], icon: '🪖', tier: 4 },
    { id: 'defense_7', type: ResearchType.Defense, name: 'Reinforced Masonry', description: 'Unlocks Reinforced Wall Plates forge order — +4 barricade per wall segment', cost: { wood: 100, stone: 90, food: 0, gold: 110, iron: 0 }, unlocked: false, researched: false, prerequisites: ['defense_5', 'defense_1'], effects: [], icon: '🧱', tier: 4 },
    { id: 'defense_8', type: ResearchType.Defense, name: 'Iron Swords', description: 'Unlocks iron sword forge order — stronger militia than spears · better counter-attacks vs predators', cost: { wood: 95, stone: 70, food: 0, gold: 130, iron: 0 }, unlocked: false, researched: false, prerequisites: ['defense_4', 'defense_6'], effects: [{ target: 'counter_attack', add: 0.55 }, { target: 'hunt_food', multiplier: 1.15 }], icon: '🗡️', tier: 5, forgeUnlockNotify: true },
    { id: 'defense_9', type: ResearchType.Defense, name: 'Scale Mail', description: 'Unlocks scale mail forge order — heavy armor for settlers · block most predator kills', cost: { wood: 85, stone: 100, food: 0, gold: 140, iron: 0 }, unlocked: false, researched: false, prerequisites: ['defense_5', 'defense_7'], effects: [{ target: 'predator_block', add: 0.72 }, { target: 'flee_speed', multiplier: 1.15 }], icon: '🦺', tier: 5, forgeUnlockNotify: true },
    { id: 'defense_10', type: ResearchType.Defense, name: 'Bastion Towers', description: 'Unlocks tower ballistae forge order — watchtowers add far more barricade strength', cost: { wood: 110, stone: 120, food: 0, gold: 150, iron: 0 }, unlocked: false, researched: false, prerequisites: ['defense_7', 'defense_1'], effects: [], icon: '🏰', tier: 5, forgeUnlockNotify: true },
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
  Riverlands: 'riverlands',
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
/** Terrain raster cell size in world units (see terrainGen / terrainLayer). */
export const TERRAIN_TILE_SIZE = 10;
export const GRID_SNAP = true;

export function snapToGrid(value: number, gridSize: number = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

export {
  GAME_VERSION, GAME_PHASE, GAME_TITLE, GAME_SUBTITLE, GAME_VERSION_TAGLINE, ECOLOGICAL_FACTS,
} from './version';

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
  // Higher counts + readable colours — 40 grey 1px streaks were invisible on the map
  [WeatherType.Rain]: { label: 'Rain', emoji: '🌧️', color: '#a8c4e0', particleCount: 140, overlayAlpha: 0.08 },
  [WeatherType.Snow]: { label: 'Snow', emoji: '❄️', color: '#f0f4f8', particleCount: 90, overlayAlpha: 0.06 },
  [WeatherType.Storm]: { label: 'Storm', emoji: '⛈️', color: '#b0c4d8', particleCount: 180, overlayAlpha: 0.12 },
  [WeatherType.Fog]: { label: 'Fog', emoji: '🌫️', color: '#d1d5db', particleCount: 0, overlayAlpha: 0.28 },
  [WeatherType.Drought]: { label: 'Drought', emoji: '🌵', color: '#92400e', particleCount: 0, overlayAlpha: 0.1 },
};
