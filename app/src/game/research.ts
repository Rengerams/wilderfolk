import type { ResearchNode, WorldState } from './gameTypes';
import { BuildingType, BUILDING_CONFIGS, ResearchType } from './gameTypes';
import { logEvent } from './eventLog';
import {
  addNotification,
  impulseScreenShake,
  getMultiplier,
} from './gameEngine';
import { getEducationResearchMultiplier } from './education';
import { isPlayerHuman } from './groupEvents';

const RESEARCH_TAB_LABELS: Record<ResearchType, string> = {
  [ResearchType.Agriculture]: 'Agriculture',
  [ResearchType.Forestry]: 'Forestry',
  [ResearchType.Mining]: 'Mining',
  [ResearchType.Architecture]: 'Architecture',
  [ResearchType.Medicine]: 'Medicine',
  [ResearchType.Trade]: 'Trade',
  [ResearchType.Education]: 'Education',
  [ResearchType.Defense]: 'Defense',
};

function researchTabLabel(type: ResearchType | undefined): string {
  return type ? RESEARCH_TAB_LABELS[type] : 'Tech';
}

function unlockTechId(state: WorldState, nodeId: string): void {
  if (!state.unlockedTechs.includes(nodeId)) {
    state.unlockedTechs.push(nodeId);
  }
}

function notifyForgeUnlock(state: WorldState, node: ResearchNode): void {
  const hasSmith = state.buildings.some((b) => b.completed && b.type === BuildingType.Blacksmith);
  addNotification(
    state,
    hasSmith ? 'Iron gear researched — queue forge' : 'Iron gear researched — build Blacksmith',
    hasSmith
      ? `Open your Blacksmith on the map → Village forge → queue ${node.name} (~6 days staffed).`
      : 'Build & complete a Blacksmith (Industry), then queue the forge order.',
    'warning',
  );
}

function notifyResearchCompletion(state: WorldState, node: ResearchNode): void {
  if (node.completionNotify) {
    addNotification(
      state,
      node.completionNotify.title,
      node.completionNotify.message,
      node.completionNotify.level ?? 'success',
    );
  }
  if (node.forgeUnlockNotify) {
    notifyForgeUnlock(state, node);
  }
}

/** Keep researched techs, unlocked flags, and build unlocks in sync (fixes older saves). */
export function syncResearchUnlocks(state: WorldState): void {
  state.unlockedTechs = [...new Set(state.unlockedTechs)];
  for (const node of state.researchNodes) {
    if (node.researched) {
      node.unlocked = true;
      unlockTechId(state, node.id);
    }
  }
  for (const node of state.researchNodes) {
    if (!node.unlocked && node.prerequisites.every((p) => state.unlockedTechs.includes(p))) {
      node.unlocked = true;
    }
  }
}

/** Mutates `state` in place (same pattern as `updateResearch`) so callers need not reassign. */
export function notifyBuildingLocked(state: WorldState, type: BuildingType): WorldState {
  syncResearchUnlocks(state);
  const config = BUILDING_CONFIGS[type];
  if (!config.unlockRequirement || state.unlockedTechs.includes(config.unlockRequirement)) return state;

  const lockTech = state.researchNodes.find((n) => n.id === config.unlockRequirement);
  const missingPrereq = lockTech?.prerequisites.find((p) => !state.unlockedTechs.includes(p));
  const prereqTech = missingPrereq
    ? state.researchNodes.find((n) => n.id === missingPrereq)
    : undefined;
  const tab = researchTabLabel(lockTech?.type);
  const chain = prereqTech
    ? `Research ${prereqTech.name} first, then ${lockTech?.name ?? 'the required tech'} (Research tab → ${tab}).`
    : `Research ${lockTech?.name ?? config.unlockRequirement} in the Research tab (→ ${tab}).`;

  addNotification(state, `${config.label} locked`, chain, 'warning');
  return state;
}

/** Mutates `state` in place (same pattern as `updateResearch`) so callers need not reassign. */
export function startResearch(state: WorldState, researchId: string): WorldState {
  const node = state.researchNodes.find(n => n.id === researchId);
  if (!node || !node.unlocked || node.researched || state.activeResearch) return state;

  const prereqsMet = node.prerequisites.every(p => state.unlockedTechs.includes(p));
  if (!prereqsMet) return state;

  const { wood = 0, stone = 0, gold = 0 } = node.cost;
  if (state.resources.wood >= wood && state.resources.stone >= stone && state.resources.gold >= gold) {
    state.resources.wood -= wood;
    state.resources.stone -= stone;
    state.resources.gold -= gold;
    state.activeResearch = researchId;
    state.researchProgress = 0;
    addNotification(state, 'Research Started', `Started researching: ${node.name}`, 'info');
  }
  return state;
}

/** Advances active research in place — called from `gameTick`, which mutates `WorldState` directly. */
export function updateResearch(state: WorldState) {
  if (!state.activeResearch) return;
  const node = state.researchNodes.find(n => n.id === state.activeResearch);
  if (!node) { state.activeResearch = null; return; }

  const educatedMult = getEducationResearchMultiplier(
    state.entities.filter((e) => e.alive && isPlayerHuman(e)),
  );
  const speedMult = getMultiplier(state, 'research_speed') * educatedMult;
  state.researchProgress += speedMult;

  if (state.researchProgress >= 100) {
    node.researched = true;
    node.unlocked = true;
    unlockTechId(state, node.id);
    state.activeResearch = null;
    state.researchProgress = 0;

    syncResearchUnlocks(state);

    addNotification(state, 'Research Complete!', `${node.name} has been researched!`, 'success');
    state.villageReputation = Math.min(100, state.villageReputation + 3);
    notifyResearchCompletion(state, node);
    logEvent(state, 'research', `${node.name} researched`);
    impulseScreenShake(state, 3);
  }
}