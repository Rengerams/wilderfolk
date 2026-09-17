// Entity types as const object
import type { Resources, ResourceKey } from './resourceTypes';
import type { ValleyStage } from './ecologyTypes';
import type { YearlyStats, LifetimeStats } from './stats';
import type { ScentGrid } from './scentGrid';
import type { BeautyGrid } from './beautyGrid';
import type { EntitySpatialGrid, RoadAvoidanceIndex } from './spatialGrid';
import type { AdjacencyIndex } from './adjacencyIndex';
import { BuildingType } from './buildings';
import type { Building } from './buildings';
import type { Challenge } from './challenges';
import type { SimRngSnapshot } from './simRng';

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
  schoolDays?: number;
  schoolTicksToday?: number;
  scheduleWorkedTicksToday?: number;
  scheduleFatigue?: number;
  educated?: boolean;
  traits?: SettlerTrait[];
  pregnant?: boolean;
  pregnancyProgress?: number;
  pregnancyDueProgress?: number;
  homeBuildingId?: number;
  residenceBuildingId?: number;
  prisonBuildingId?: number;
  prisonerUntilTick?: number;
  prisonSentenceCrime?: 'scandal';
  occupation?: string;
  job?: JobType;
  skills?: Partial<Record<JobType, number>>;
  relationshipStatus?: 'single' | 'married' | 'expecting' | 'widowed';
  attraction?: number;
  partnerId?: number;
  affairPartnerId?: number;
  affairProgress?: number;
  lastAffairSiteDay?: number;
  lastAffairSiteX?: number;
  lastAffairSiteY?: number;
  scandalCooldownUntilTick?: number;
  griefUntilTick?: number;
  lastMetPartner?: number;
  courtshipPartnerId?: number;
  courtshipProgress?: number;
  youthLovePartnerId?: number;
  youthLoveProgress?: number;
  youthLoveStartedDay?: number;
  pregnantById?: number;
  fatherId?: number;
  motherId?: number;
  isBastard?: boolean;
  adoptiveMotherId?: number;
  adoptiveFatherId?: number;
  childrenIds?: number[];
  forageKind?: 'blueberry';
  blueberryYield?: number;
  blueberryNextRegrowthDay?: number;
  blueberryForageTargetId?: number;
  name?: string;
  surname?: string;
  title?: string;
  migrationTag?: number;
  schoolGossipDay?: number;
  schoolBondDay?: number;
  childhoodFriendsIds?: number[];
  friendships?: Record<string, number>;
  feuds?: Record<string, number>;
  apprenticeOfId?: number;
  apprenticeId?: number;
  maidenSurname?: string;
  generation?: number;
  spriteAngle?: number;
  animFrame?: number;
  spriteVariant?: number;
  combatRollSeed?: number;
  chatPhrase?: string;
  chatTicks?: number;
  chatPartnerId?: number;
  chatDialogueSessionKey?: string;
  moonHowlerCursed?: boolean;
  moonHowlerSaved?: {
    energy: number;
    maxEnergy: number;
    speed: number;
    size: number;
    job?: JobType;
    occupation?: string;
    homeBuildingId?: number;
    residenceBuildingId?: number;
    prisonBuildingId?: number;
    prisonerUntilTick?: number;
    prisonSentenceCrime?: 'scandal';
    relationshipStatus?: 'single' | 'married' | 'expecting' | 'widowed';
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
  tamedBy?: number;
  faction?: 'visitor' | 'rival' | 'trade_caravan';
  hiddenFromPlayer?: boolean;
  detectedByPatrol?: boolean;
  groupId?: string;
  hotelStayBuildingId?: number;
  hotelStayUntilTick?: number;
  huntTargetId?: number;
  combatTicks?: number;
}

export type VisitorKind = 'traders' | 'pilgrims' | 'scholars' | 'hunters' | 'nomads' | 'refugees' | 'performers';

export interface VisitorGroup {
  id: string;
  name: string;
  kind: VisitorKind;
  campX: number;
  campY: number;
  daysLeft: number;
  spawnedAtCalendarDay?: number;
  entityIds: number[];
  giftsGiven: number;
  tradesCompleted: number;
  gold?: number;
  refugeeResolved: boolean;
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
  contactCount: number;
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
  raidCooldownDays: number;
  peaceTreatyDays: number;
  profile?: RivalProfile;
}

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

export interface StoryChoice {
  id: string;
  label: string;
  detail: string;
}

export interface StoryEvent {
  id: string;
  emoji: string;
  title: string;
  description: string;
  choices: StoryChoice[];
  createdAtTick: number;
  expiresAtTick: number;
  storyKey:
    | 'welcome'
    | 'wolf_choice'
    | 'ranger_visit'
    | 'howler_rumor'
    | 'grief_beat'
    | 'winter_prep'
    | 'valley_debate'
    | 'children_shelter'
    | 'deer_parliament'
    | 'traveling_theatre'
    | 'wedding_diplomacy'
    | 'invention_fair'
    | 'rumour_ledger';
}

export type PopulationHistoryPoint = PopulationHistoryEntry;

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
  completionNotify?: ResearchCompletionNotify;
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
  requiresForge?: ForgeOrderId[];
  inputs: Partial<Resources>;
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
  expiresAtTick: number;
  marchDistanceTiles: number;
  attackerStrength: number;
  lootFood: number;
  lootGold: number;
  lootWood: number;
  lootStone: number;
}

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
  reason: 'founding' | 'term' | 'succession';
  pendingLeaderId: number;
  pendingLeaderName: string;
  pendingChanged: boolean;
}

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
  humanPopulation: number;
  maxHumanPopulation: number;
  wildlifeCounts: WildlifeCounts;
  workingSettlers: number;
  idleSettlers: number;
  villageName: string;
  workSchedule?: import('./workSchedule').WorkSchedule;
  tavernSchedule?: import('./venueSchedule').VenueSchedule;
  hotelSchedule?: import('./venueSchedule').VenueSchedule;
  villageReputation: number;
  resources: Resources;
  storageMax: Resources;
  foodSpoilageRate: number;
  ecosystemHealth: number;
  biodiversityIndex: number;
  pollutionLevel: number;
  valleyStage?: ValleyStage;
  valleyStageSinceDay?: number;
  valleyRawStressStreakDays?: number;
  valleyRawCalmStreakDays?: number;
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
  screenShakeImpulse: number;
  disasters: Disaster[];
  tradeRoutes: TradeRoute[];
  totalBuildingsCompleted: number;
  lastProcessedCalendarDay?: number;
  villageCanHeat?: boolean;
  worldMap: WorldMap | null;
  guidedCampaign?: import('./guidedCampaign').GuidedCampaignState;
  yearlyStats: YearlyStats[];
  lifetimeStats: LifetimeStats;
  eventLog: GameEventLog[];
  chronicleChapters?: string[];
  festival: { active: boolean; name: string; daysLeft: number } | null;
  townHallFestivalCooldownUntilTick?: number;
  visitorGroups: VisitorGroup[];
  rivalSettlements: RivalSettlement[];
  pendingDiplomacyEvents: DiplomacyEvent[];
  pendingRaidEvents: RaidEvent[];
  pendingStoryEvents?: StoryEvent[];
  storyFlags?: Record<string, number>;
  pendingOutgoingRaidEvents: OutgoingRaidEvent[];
  renffrOmen?: RenffrOmen | null;
  renffrChatterUntilTick?: number;
  ecoHealthYearsAbove80: number;
  firstWeekVisitorSpawned: boolean;
  villageLeaderId: number | null;
  leaderSinceYear: number;
  lastElectionYear: number;
  pendingElectionYear: number | null;
  electionBuildupNotifiedYear: number | null;
  electionCeremony: ElectionCeremonyState | null;
  villageForge?: VillageForgeState;
  tutorialSeen?: string[];
  economyLedger?: DailyEconomyLedger;
  foodHistory?: FoodDaySample[];
  visitorQuest?: VisitorQuest;
  activeVillageRequest?: VillageRequest;
  villageRequestCooldownUntilDay?: number;
  villageRequestHistory?: VillageRequestHistoryEntry[];
  leaderPromise?: LeaderPromise;
  lastWildlifeReplenishLogDay?: number;
  dismissedBigNewsIds?: string[];
  dismissedActiveEventIds?: string[];
  dismissedNotificationIds?: string[];
  huntVisuals?: HuntVisual[];
  lastMoonHowlerExorcismTick?: number;
  moonHowlerPriestsFleeUntil?: number;
  activeMigration?: { herdYear: number; endDay: number; spawned: number };
  migrationNextHerdSize?: number;
  beautyGrid?: BeautyGrid;
  villageHappiness?: number;
  scentGrid?: ScentGrid;
  entityByType?: EntityByType;
  grassGrid?: EntitySpatialGrid;
  mobileGrid?: EntitySpatialGrid;
  humanSocialGrid?: EntitySpatialGrid;
  treeGrid?: EntitySpatialGrid;
  roadAvoidance?: RoadAvoidanceIndex;
  roadAvoidanceStamp?: number;
  adjacency?: AdjacencyIndex;
  entityById?: Map<number, Entity>;
  eventsThisYear?: string[];
  /**
   * Deaths accumulated during the current calendar year, reset at the year rollover.
   * Counted by `gameTick` from the entities that were alive at the start of the tick and are
   * not alive at the end of it, because `state.entities` only ever holds the living.
   */
  deathsThisYear?: { humans: number; animals: number };
  /**
   * Positions of this realm's RNG streams, carried across a realm boundary (save file, worker
   * hand-off, prep rollback snapshot). The live state is owned by `simRng`; this field is only a
   * transport container, refreshed at each boundary so a resumed or retried world continues its
   * draws instead of replaying each owner's sequence from the start (audit cross-cutting X5).
   */
  simRng?: SimRngSnapshot;
  appliedSaveMigrations?: string[];
}

export type GameState = WorldState;
export type CombatLogKind = 'incoming_raid' | 'outgoing_raid' | 'defense' | 'repelled';

export interface GameEventLog {
  id: number;
  tick: number;
  year: number;
  day: number;
  type:
    | 'birth'
    | 'conception'
    | 'death'
    | 'marriage'
    | 'divorce'
    | 'scandal'
    | 'building'
    | 'disaster'
    | 'research'
    | 'trade'
    | 'migration'
    | 'season'
    | 'event'
    | 'combat'
    | 'milestone';
  message: string;
  entityName?: string;
  combatKind?: CombatLogKind;
}

export interface DailyEconomyLedger {
  day: number;
  produced: Record<string, number>;
  consumed: Record<string, number>;
}

export interface FoodDaySample {
  day: number;
  produced: Record<string, number>;
  consumed: Record<string, number>;
}

export interface LeaderPromise {
  goal: 'buildings' | 'food';
  label: string;
  target: number;
  startValue: number;
}

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
  expiresDay: number;
}

export interface VillageRequestChoice {
  id: 'accept' | 'decline';
  label: string;
  detail: string;
}

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
  focus?: { x: number; y: number };
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
    { id: 'mining_1', type: ResearchType.Mining, name: 'Deep Mining', description: 'Quarry yield +20%', cost: { wood: 60, stone: 30, food: 0, gold: 40, iron: 0 }, unlocked: true, researched: true, prerequisites: [], effects: [{ target: 'quarry_yield', multiplier: 1.2 }], icon: '⛏️', tier: 1 },
    { id: 'mining_2', type: ResearchType.Mining, name: 'Refining', description: 'Mine output +30% · unlocks Iron Pickaxes forge order at Blacksmith', cost: { wood: 80, stone: 50, food: 0, gold: 70, iron: 0 }, unlocked: false, researched: false, prerequisites: ['mining_1'], effects: [{ target: 'stone_production', multiplier: 1.3 }], icon: '⚒️', tier: 2, forgeUnlockNotify: true },
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
    { id: 'defense_6', type: ResearchType.Defense, name: 'Militia Drill', description: 'Unlocks Guard Halberds forge order — +6 militia per staffed barracks guard', cost: { wood: 90, stone: 55, food: 0, gold: 100, iron: 0 }, unlocked: false, researched: false, prerequisites: ['defense_4'], effects: [], icon: '🪖', tier: 4, forgeUnlockNotify: true },
    { id: 'defense_7', type: ResearchType.Defense, name: 'Reinforced Masonry', description: 'Unlocks Reinforced Wall Plates forge order — +4 barricade per wall segment', cost: { wood: 100, stone: 90, food: 0, gold: 110, iron: 0 }, unlocked: false, researched: false, prerequisites: ['defense_5', 'defense_1'], effects: [], icon: '🧱', tier: 4, forgeUnlockNotify: true },
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
  elevation: number;
  moisture: number;
  variation: number;
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
  Medium: 'medium',
  Large: 'large',
  Huge: 'huge',
} as const;
export type MapSize = (typeof MapSize)[keyof typeof MapSize];

export const MAP_SIZE_DIMENSIONS: Record<MapSize, { width: number; height: number }> = {
  [MapSize.Medium]: { width: 1200, height: 900 },
  [MapSize.Large]: { width: 1600, height: 1200 },
  [MapSize.Huge]: { width: 2560, height: 1920 },
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

// Corrected: taming lines reflect companionship and taming, not Church exorcisms
export const WEREWOLF_TAME_LINES = [
  'The beast accepts your offering. A fearsome guardian now patrols the village.',
  'Tamed with venison and patience. The beast now answers your call.',
  'A low growl softened into a loyal companion.',
  'Fangs lowered and a pact formed. The wild beast has joined your settlement.',
] as const;

export interface WeatherConfig {
  label: string;
  emoji: string;
  color: string;
  particleCount: number;
  overlayAlpha: number;
}

export const WEATHER_CONFIGS: Record<WeatherType, WeatherConfig> = {
  [WeatherType.Clear]: { label: 'Clear', emoji: '', color: '', particleCount: 0, overlayAlpha: 0 },
  [WeatherType.Rain]: { label: 'Rain', emoji: '🌧️', color: '#a8c4e0', particleCount: 140, overlayAlpha: 0.08 },
  [WeatherType.Snow]: { label: 'Snow', emoji: '❄️', color: '#f0f4f8', particleCount: 90, overlayAlpha: 0.06 },
  [WeatherType.Storm]: { label: 'Storm', emoji: '⛈️', color: '#b0c4d8', particleCount: 180, overlayAlpha: 0.12 },
  [WeatherType.Fog]: { label: 'Fog', emoji: '🌫️', color: '#d1d5db', particleCount: 0, overlayAlpha: 0.28 },
  [WeatherType.Drought]: { label: 'Drought', emoji: '🌵', color: '#92400e', particleCount: 0, overlayAlpha: 0.1 },
};