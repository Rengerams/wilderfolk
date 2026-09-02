import type { Entity, WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import type { PopulationCounts } from './entityCounts';
import type { TickContext } from './simulation/simulationTypes';
import { isNewCalendarDayTick } from './dayCycle';
import { addFloatingText } from './simEffects';
import { advanceSocialRelationships } from './relationships';
import { advanceYouthLove } from './simulation/humanRelationships';
import { advanceApprenticeships } from './apprenticeships';
import { tickDailyPopulation } from './dailyPopulation';
import { tickDailyChallenges } from './dailyChallenges';
import { tickGrassDaily } from './dailyGrassEcology';
import { resolveDailyVillageScheduleFatigue } from './dailyScheduleFatigue';
import { tickDailyBuildingEconomy } from './dailyBuildingEconomy';
import { tickDailyWorldEvents } from './dailyWorldEvents';
import { applyDailyWeatherEffects } from './worldEvents';
import { replenishDepletedWildlife } from './worldGen';
import { advanceValleyChronicle, VALLEY_CHAPTERS } from './valleyChronicle';
import { seededRandom } from './simRng';
import { getReproductionMultiplier } from './simHelpers';
import { getSpeciesConfig } from './speciesConfig';

;

// ==================== DAILY LAYER ENTRYPOINT ====================

export function tickLayerDaily(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
  counts: PopulationCounts,
): void {

  if (isNewCalendarDayTick(state)) {
    resolveDailyVillageScheduleFatigue(state, ctx.playerHumans);
  }

  if (state.tick > 0) {
    advanceSocialRelationships(state, allAlive);
    advanceYouthLove(state, ctx);
    advanceApprenticeships(state, allAlive);

    // Valley Chronicle — milestone chapters unlock once per day boundary.
    const newlyUnlocked = advanceValleyChronicle(state);
    if (newlyUnlocked.length > 0) {
      for (const id of newlyUnlocked) {
        const chapter = VALLEY_CHAPTERS.find((c) => c.id === id);
        if (chapter) {
          addFloatingText(state, state.width / 2, state.height / 2, `${chapter.icon} ${chapter.title}`, '#fbbf24', 'brief');
        }
      }
    }
  }

  applyDailyWeatherEffects(state);
  tickGrassDaily(state, ctx, allAlive);
  tickDailyBuildingEconomy(state, ctx, allAlive);
  tickDailyPopulation(state, ctx, allAlive, counts);
  tickDailyWorldEvents(state, ctx, allAlive, counts);
  tickDailyChallenges(state, ctx, counts);
  replenishDepletedWildlife(state);
  tickDailyWildlifeReproduction(state, allAlive);
}

/**
 * Per-day pregnancy chance check for wildlife.
 * Since animals don't have gender, we divide population by 2 to approximate females.
 * Each potential female has a 30% base chance modified by individual RNG and season.
 */
// FIX: Optimized to single pass over allAlive instead of two full loops
function tickDailyWildlifeReproduction(state: WorldState, allAlive: Entity[]): void {
  const season = state.season;
  const reproMult = getReproductionMultiplier(season);
  const reproResetCandidates: Entity[] = [];

  for (let i = 0; i < allAlive.length; i++) {
    const entity = allAlive[i];
    
    // Skip non-wildlife
    if (entity.type === EntityType.Human || entity.type === EntityType.Tree || entity.type === EntityType.Grass) continue;
    if (entity.pregnant) continue;
    if (entity.reproductionCooldown > 0) continue;
    if (entity.energy < getSpeciesConfig(entity.type).reproductionEnergyThreshold) continue;

    // Divide population by 2 to approximate females (animals have no gender)
    // Use even-indexed entities as "females"
    if (i % 2 !== 0) continue;

    // Individual RNG seed per animal
    const rng = seededRandom(entity.id, 'dailyRepro');
    const individualChance = 0.30 * rng * reproMult;

    if (Math.random() < individualChance) {
      // Will attempt conception in the next wildlife tick
      entity.reproductionCooldown = -1; // Special marker: ready to breed
      reproResetCandidates.push(entity);
    }
  }

  // Reset the marker only for candidates (single small loop instead of full allAlive loop)
  for (const entity of reproResetCandidates) {
    entity.reproductionCooldown = 0;
  }
}