import type { WorldState, Building, GameEvent, RivalSettlement } from './gameTypes';
import { getSimRng } from './simRng';
import { pickSite } from './worldEventSites';
import { getPlayerCampCenter, rollFoundingRaidCooldownDays } from './frontierCombat';
import { createRivalProfile } from './rivalProfiles';
import { addBigNews } from './simEffects';
import { logEvent } from './eventLog';

const RIVAL_PREFIXES = ['Oak', 'Mist', 'Iron', 'Silver', 'Ash', 'Cedar', 'Stone', 'Willow', 'Fox', 'Raven'];
const RIVAL_SUFFIXES = ['Hollow', 'Reach', 'Ford', 'Glen', 'Creek', 'Ridge', 'Crossing', 'Haven'];

function randomRivalName(): string {
  const prefix = RIVAL_PREFIXES[Math.floor(getSimRng('groupEvents')() * RIVAL_PREFIXES.length)];
  const suffix = RIVAL_SUFFIXES[Math.floor(getSimRng('groupEvents')() * RIVAL_SUFFIXES.length)];
  return `${prefix}${suffix}`;
}

export function spawnRivalSettlement(
  state: WorldState,
  buildings: Building[],
  /** Scripted founding state; the pool draws its own when this is omitted. */
  foundingRelationship?: RivalSettlement['relationship'],
): GameEvent {
  const name = randomRivalName();
  const center = getPlayerCampCenter(state, buildings);
  const avoid = [
    center,
    ...state.rivalSettlements.map((r) => ({ x: r.campX, y: r.campY })),
    ...state.visitorGroups.map((v) => ({ x: v.campX, y: v.campY })),
  ];
  const site = pickSite(state, center, 180, Math.min(state.width, state.height) * 0.38, avoid);
  const groupId = `rival_${state.tick}_${Math.floor(getSimRng('groupEvents')() * 10000)}`;
  const pop = 4 + Math.floor(getSimRng('groupEvents')() * 4);
  const relRoll = getSimRng('groupEvents')();
  const relationship: RivalSettlement['relationship'] = foundingRelationship
    ?? (relRoll < 0.3 ? 'friendly' : relRoll < 0.7 ? 'neutral' : relRoll < 0.95 ? 'competitive' : 'tense');

  state.rivalSettlements.push({
    id: groupId,
    name,
    campX: site.x,
    campY: site.y,
    population: pop,
    entityIds: [],
    buildingIds: [],
    relationship,
    foundedYear: state.year,
    daysUntilAction: 30 + Math.floor(getSimRng('groupEvents')() * 30),
    raidCooldownDays: rollFoundingRaidCooldownDays(getSimRng('groupEvents')()),
    peaceTreatyDays: 0,
    giftsGiven: 0,
    profile: createRivalProfile(groupId.length + state.year + pop, relationship),
  });

  const relText = {
    friendly: 'They wave warmly from afar.',
    neutral: 'They keep to themselves for now.',
    competitive: 'They eye your hunting grounds.',
    tense: 'Their leader looks… unamused.',
  }[relationship];

  addBigNews(state, '🏕️ New Settlement!', `${name} (${pop} settlers) founded a settlement beyond your village. ${relText}`, relationship === 'tense' ? 'negative' : 'neutral');
  logEvent(state, 'migration', `${name} established a rival settlement on the frontier`, name);

  return {
    id: `rival_settlement_${state.tick}`,
    title: `🏕️ ${name} Settles Nearby`,
    description: `Another group has claimed land on the same frontier — ${pop} inhabitants beyond your village.`,
    emoji: '🏕️',
    effect: `Relationship: ${relationship}`,
    type: relationship === 'tense' ? 'negative' : 'neutral',
  };
}

