import type { Entity, WorldState } from './gameTypes';

/**
 * Allow-list of WorldState keys — prevents view/UI fields from leaking into simulation state.
 *
 * **It is an allow-list, so a field's absence from it is a durability decision — and two of those
 * decisions were made by accident.** These simulation-touching fields are deliberately *not* here, and
 * the reason belongs beside them rather than in the reader's head:
 *
 * - `huntVisuals` — a ~1 s arrow animation (`huntvisuals.ts`, capped at 8). It rides the tick delta
 *   and the rollback payload, so a *failed* tick undoes it correctly, but a reload legitimately loses
 *   an arrow in flight. The behaviour is right; recording it here is what was missing.
 * - `disasters` — **not** deliberate. It is written and restored by the transient pair
 *   (`viewState.ts` `pickTransientWorldFieldsForSave` / `restoreTransientWorldFieldsFromSave`), which
 *   is a third list with its own rules, so it happens to round-trip today while sitting outside this
 *   one. It is unreachable only because `HOSTILE_WEATHER_ENABLED = false` (`worldEvents.ts`). Before
 *   hostile weather is re-enabled, either add it here or move it into this list's story — the field
 *   must not be durable by the accident of being on the transient list.
 * - `workingSettlers` / `idleSettlers` — recomputed every tick and read by no view
 *   (`tests/uiRefinement.owners.test.ts`).
 * - `scentGrid` — simulation state in a runtime-cache slot; dropped on purpose on save and recreated
 *   by the first realtime tick (`worldRuntimeCaches.ts` documents the two duties).
 * - `deathParticles` / `floatingTexts` / `notifications` — transient presentation, round-tripped by
 *   the same transient pair as `disasters` (so they survive today, by that list's choice).
 */
export const WORLD_STATE_SAVE_KEYS = [
  'entities', 'buildings', 'tick', 'season', 'year', 'dayInYear', 'populationHistory',
  'width', 'height', 'nextEntityId', 'nextBuildingId', 'nextFloatingTextId',
  'paused', 'speed', 'activeEvent', 'lastEventYear', 'bountifulHarvest',
  'humanPopulation', 'maxHumanPopulation', 'wildlifeCounts', 'villageName', 'workSchedule', 'tavernSchedule', 'hotelSchedule', 'villageReputation',
  'resources', 'storageMax', 'foodSpoilageRate', 'ecosystemHealth', 'biodiversityIndex',
  'pollutionLevel', 'valleyStage', 'valleyStageSinceDay', 'valleyRawStressStreakDays',
  // Queued story adjustments to the two derived ecology fields. They are written and cleared inside
  // one daily tick, so they only matter if the save lands between the story writers and
  // `tickEcosystemMetrics` — but dropping them there silently discarded that day's story effect.
  'pendingEcosystemHealthDelta', 'pendingPollutionDelta',
  'valleyRawCalmStreakDays', 'valleyLastStageNotifyDay',
  'challenges', 'autoSave', 'weather', 'weatherTimer', 'researchNodes',
  'unlockedTechs', 'activeResearch', 'researchProgress',
  'tradeRoutes', 'totalBuildingsCompleted', 'lastProcessedCalendarDay', 'yearlyStats',
  'lifetimeStats', 'eventLog', 'chronicleChapters', 'festival', 'townHallFestivalCooldownUntilTick',
  'visitorGroups', 'activeVillageRequest', 'villageRequestCooldownUntilDay', 'villageRequestHistory',
  'rivalSettlements', 'pendingDiplomacyEvents', 'pendingRaidEvents', 'pendingOutgoingRaidEvents',
  'renffrOmen', 'renffrChatterUntilTick',
  'activeMigration', 'migrationNextHerdSize',
  'ecoHealthYearsAbove80', 'firstWeekVisitorSpawned', 'villageLeaderId', 'leaderSinceYear',
  'lastElectionYear', 'pendingElectionYear', 'electionBuildupNotifiedYear', 'electionCeremony',
  'villageForge', 'tutorialSeen', 'dismissedBigNewsIds', 'dismissedActiveEventIds',
  'dismissedNotificationIds', 'lastWildlifeReplenishLogDay', 'eventsThisYear',
  'appliedSaveMigrations',
  'storyFlags', 'pendingStoryEvents', 'guidedCampaign',
  // The traveling-smith quest is created and expired only inside the simulation, so it
  // must round-trip with the world it belongs to.
  'visitorQuest',
  // The current year's death tally (the yearly record's `deaths`).
  'deathsThisYear',
  // Moon Howler lifecycle state written every full moon: the church-rite cooldown and the
  // priest-fear window. Without these a reload let the cure rite fire again immediately
  // (save-scumming the roll) and un-scared the priests that had just fled.
  'lastMoonHowlerExorcismTick', 'moonHowlerPriestsFleeUntil',
  // Village happiness is derived daily by `beautyGrid` but rendered by the Population panel.
  'villageHappiness',
  // Whether today's heating was paid for. `tickWinterHeating` computes it once per day and caches it
  // on the world (`villageCanHeat`), and for the rest of that day the *simulation* reads it to decide
  // whether every settler takes the unheated-winter energy penalty (`humanNeeds`, ×1.5) and the
  // freeze flash. It was absent from this list, so a save taken mid-winter-day after the morning wood
  // burn failed loaded back with the field `undefined`, `!== false` read that as "heated", and the
  // reload refunded the rest of the day's cold — the same reload-for-an-advantage class the three
  // moon-howler fields above were added to close. A plain boolean.
  'villageCanHeat',
  // Workforce policy preset (roadmap F3): the auto-staffing priority order the player picked.
  'workforcePolicy',
  // Food accounting (`economyLedger` = today's row, `foodHistory` = the rolling 30-day archive).
  // Both rode the tick delta and the rollback payload but not the save, and nothing rebuilds them:
  // the next day's production cannot rewrite an archived day, and `getEconomyLedger` returns null
  // until the ledger's own `day` matches today — so every load blanked the dashboard's
  // "Food, last finished day" row, the `foodDays` history and the village panel's food card
  // (`LIVE-FINDINGS-STATUS.md`, E-3). Both shapes are plain JSON: numbers and
  // `Record<string, number>` maps, no Map/Set/class instance (`gameTypes.DailyEconomyLedger`,
  // `gameTypes.FoodDaySample`), so `pickWorldFieldsForSave` round-trips them by reference-free
  // serialisation like the rest of the allow-list. The load half needs no code of its own:
  // `loadGameFromParsed` spreads `pickWorldStateFromSave`'s result into the world.
  'economyLedger', 'foodHistory',
] as const satisfies readonly (keyof WorldState)[];

/**
 * Entity fields nested under `entities` that must survive save/load and worker catalog sync.
 * (Not top-level WORLD_STATE_SAVE_KEYS — those are world-level only.)
 */
export const ENTITY_PERSISTED_FIELDS = [
  'skills',
  'moonHowlerSaved',
  'moonHowlerCursed',
  'pregnantById',
  'pregnancyProgress',
  'pregnancyDueProgress',
  'tamedBy',
  'migrationTag',
  'forageKind',
  'blueberryYield',
  'blueberryNextRegrowthDay',
] as const satisfies readonly (keyof Entity)[];

export function pickWorldFieldsForSave(world: WorldState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of WORLD_STATE_SAVE_KEYS) {
    if (key in world) out[key] = world[key as keyof WorldState];
  }
  return out;
}