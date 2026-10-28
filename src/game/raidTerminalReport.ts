import { citizenFullName } from './citizenId';
import type { GameEventLog, WorldState } from './gameTypes';
import { isPlayerHuman } from './playerHuman';
import { VALLEY_CHAPTERS } from './valleyChronicle';

export interface RaidTerminalReport {
  lastLeaderId: number | null;
  lastLeaderName: string | null;
  survivors: number;
  playerDeaths: number | null;
  enemyDeaths: number | null;
  damagedBuildings: number | null;
  playerFallen: readonly string[];
  chapters: ReadonlyArray<{ id: string; icon: string; title: string; detail: string }>;
  highlights: ReadonlyArray<Pick<GameEventLog, 'id' | 'year' | 'day' | 'type' | 'message'>>;
}

const MAX_TERMINAL_HIGHLIGHTS = 5;

/** Read the last settlement's recorded history, never recomputing a battle or a milestone. */
export function buildRaidTerminalReport(world: WorldState): RaidTerminalReport | null {
  const recovery = world.raidRecovery;
  if (recovery?.status !== 'destroyed') return null;

  const battle = world.raidBattleReports?.find((entry) => entry.raidId === recovery.raidId);
  const leaderId = battle?.leaderId ?? null;
  const ancestor = leaderId == null ? undefined : world.genealogyRegistry?.people[String(leaderId)];
  let leaderName = ancestor?.name?.trim() ? citizenFullName(ancestor) : null;
  let survivors = 0;
  for (const entity of world.entities) {
    if (entity.alive && isPlayerHuman(entity)) survivors++;
    if (!leaderName && leaderId != null && entity.id === leaderId && entity.name?.trim()) {
      leaderName = citizenFullName(entity);
    }
  }

  const reached = new Set(world.chronicleChapters ?? []);
  const chapters = VALLEY_CHAPTERS.filter((chapter) => reached.has(chapter.id))
    .map(({ id, icon, title, detail }) => ({ id, icon, title, detail }));

  const highlights: RaidTerminalReport['highlights'][number][] = [];
  const seen = new Set<number>();
  for (const event of world.eventLog) {
    if (highlights.length === MAX_TERMINAL_HIGHLIGHTS) break;
    if (seen.has(event.id)) continue;
    if (event.type !== 'milestone' && event.type !== 'election'
      && event.type !== 'disaster' && event.type !== 'death'
      && event.type !== 'combat') continue;
    if (event.type === 'combat' && (event.combatStage === 'casualties'
      || event.combatStage === 'dispatched')) continue;
    seen.add(event.id);
    highlights.push({ id: event.id, year: event.year, day: event.day,
      type: event.type, message: event.message });
  }

  return {
    lastLeaderId: leaderId,
    lastLeaderName: leaderName,
    survivors,
    playerDeaths: battle?.playerDeaths ?? null,
    enemyDeaths: battle?.enemyDeaths ?? null,
    damagedBuildings: battle?.damagedBuildings ?? null,
    playerFallen: battle?.playerFallen ?? [],
    chapters,
    highlights,
  };
}
