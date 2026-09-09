/**
 * Famine desperation comedy (2026-09-08, developer joke feature).
 *
 * When the village larder is completely empty and a settler is truly starving,
 * the most desperate settler may lunge at a neighbour's "foot". This is a joke
 * beat — deliberately NON-LETHAL: no health, energy, or death changes. The only
 * real effect is that the victim is not amused, so the pair's friendship score
 * drops (`hurtFriendship`). If nothing else, it gives the player a grim chuckle
 * and a reason to feed the village before friendships rot.
 *
 * Cadence: called once per colony day from the daily world-events owner. Fires
 * at most one bite per famine day, gated by a deterministic per-person roll.
 */
import type { Entity, WorldState } from './gameTypes';
import { addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { isPlayerHuman } from './playerHuman';
import { personDayRoll } from './dayCycle';
import { hurtFriendship } from './relationships';
import { Famine } from './gameConstants';
import { formatCitizenName } from './citizenId';

const ROLL_BITE_ATTEMPT = 981;
const ROLL_BITE_VICTIM = 982;
const ROLL_BITE_SUCCESS = 983;

function starvingCandidates(allAlive: readonly Entity[]): Entity[] {
  const adults: Entity[] = [];
  for (const e of allAlive) {
    if (e.alive && isPlayerHuman(e) && !e.isJuvenile) adults.push(e);
  }
  return adults;
}

/** The most desperate attacker: lowest energy ratio among the starving adults. */
function pickDesperateAttacker(adults: readonly Entity[]): Entity | null {
  if (adults.length < 2) return null;
  let best: Entity | null = null;
  let bestRatio = Infinity;
  for (const e of adults) {
    const ratio = e.maxEnergy > 0 ? e.energy / e.maxEnergy : 1;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = e;
    }
  }
  // Not actually desperate yet — don't bite over a half-empty belly.
  if (bestRatio > Famine.BITE_DESPERATE_ENERGY_RATIO) return null;
  return best;
}

function pickVictim(attacker: Entity, adults: readonly Entity[], tick: number): Entity | undefined {
  const others = adults.filter((e) => e.id !== attacker.id);
  if (others.length === 0) return undefined;
  const idx = Math.floor(personDayRoll(attacker.id, tick, ROLL_BITE_VICTIM) * others.length);
  return others[Math.min(idx, others.length - 1)];
}

/** Daily famine foot-bite joke — one possible per day, never lethal. */
export function tickFamineDesperation(state: WorldState, allAlive: readonly Entity[]): void {
  if (state.tick <= 0) return;
  if (state.resources.food > 0) return; // no famine → no desperate biting

  const adults = starvingCandidates(allAlive);
  if (adults.length < 2) return;

  const attacker = pickDesperateAttacker(adults);
  if (!attacker) return;

  if (personDayRoll(attacker.id, state.tick, ROLL_BITE_ATTEMPT) >= Famine.BITE_ATTEMPT_CHANCE) return;

  const victim = pickVictim(attacker, adults, state.tick);
  if (!victim || victim.id === attacker.id) return;

  const success = personDayRoll(attacker.id, state.tick, ROLL_BITE_SUCCESS) < Famine.BITE_SUCCESS_CHANCE;
  hurtFriendship(attacker, victim, success ? Famine.BITE_FRIENDSHIP_HIT_SUCCESS : Famine.BITE_FRIENDSHIP_HIT_MISS);

  const attackerName = formatCitizenName(attacker);
  const victimName = formatCitizenName(victim);

  if (success) {
    addNotification(state, '🍖 Desperate times', `${attackerName} took a bite out of ${victimName}'s foot. ${victimName} is not amused.`, 'warning');
    logEvent(state, 'scandal', `${attackerName} took a bite out of ${victimName}'s foot during the famine. ${victimName} is not amused.`);
  } else {
    addNotification(state, '🍖 Desperate times', `${attackerName} tried to eat ${victimName}'s foot. ${victimName} backed away quickly.`, 'warning');
    logEvent(state, 'scandal', `${attackerName} tried to eat ${victimName}'s foot during the famine. The attempt failed.`);
  }
}
