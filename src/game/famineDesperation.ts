/**
 * Famine desperation comedy, called once per colony day: at most one non-lethal "foot" bite per
 * famine day, which costs friendship and can open a feud but never health, energy or a death.
 */
import type { Entity, WorldState } from './gameTypes';
import { addNotification } from './simEffects';
import { logEvent } from './eventLog';
import { isPlayerHuman } from './playerHuman';
import { HUMAN_ADULT_MIN_AGE } from './daycycleconstants';
import { getSimRng, randomBool, randomChoice } from './simRng';
import { hurtFriendship, startFeud } from './relationships';
import { Famine } from './gameConstants';
import { HUMAN_NEEDS } from './simulation/humanPhysiology';
import { citizenFullName } from './citizenId';

/** Domain-isolated RNG stream: deterministic per run seed, separate from other systems. */
const RNG_OWNER = 'famine-desperation';

function starvingCandidates(allAlive: readonly Entity[]): Entity[] {
  const adults: Entity[] = [];
  for (const e of allAlive) {
    if (e.alive && isPlayerHuman(e) && e.age >= HUMAN_ADULT_MIN_AGE) adults.push(e);
  }
  return adults;
}

/** The most desperate attacker: lowest nutrition reserve among the starving adults. */
function pickDesperateAttacker(adults: readonly Entity[]): Entity | null {
  if (adults.length < 2) return null;
  let best: Entity | null = null;
  let bestRatio = Infinity;
  for (const e of adults) {
    const ratio = e.needs?.nutrition ?? 100;
    if (ratio < bestRatio) {
      bestRatio = ratio;
      best = e;
    }
  }
  // Not actually desperate yet — don't bite over a half-empty belly.
  if (bestRatio > HUMAN_NEEDS.NUTRITION_FAMINE_BITE_THRESHOLD) return null;
  return best;
}

function pickVictim(attacker: Entity, adults: readonly Entity[], rng: () => number): Entity | undefined {
  const others = adults.filter((e) => e.id !== attacker.id);
  if (others.length === 0) return undefined;
  return randomChoice(rng, others);
}

/** Daily famine foot-bite joke — one possible per day, never lethal. */
export function tickFamineDesperation(state: WorldState, allAlive: readonly Entity[]): void {
  if (state.tick <= 0) return;
  if (state.resources.food > 0) return; // no famine → no desperate biting

  const adults = starvingCandidates(allAlive);
  if (adults.length < 2) return;

  const attacker = pickDesperateAttacker(adults);
  if (!attacker) return;

  const rng = getSimRng(RNG_OWNER);
  if (!randomBool(rng, Famine.BITE_ATTEMPT_CHANCE)) return;

  const victim = pickVictim(attacker, adults, rng);
  if (!victim || victim.id === attacker.id) return;

  const success = randomBool(rng, Famine.BITE_SUCCESS_CHANCE);
  // A landed bite's feud already charges the friendship; a failed lunge charges the miss only.
  if (!success) hurtFriendship(attacker, victim, Famine.BITE_FRIENDSHIP_HIT_MISS);

  const attackerName = citizenFullName(attacker);
  const victimName = citizenFullName(victim);

  if (success) {
    addNotification(state, '🍖 Desperate times', `${attackerName} took a bite out of ${victimName}'s foot. ${victimName} is not amused.`, 'warning');
    logEvent(state, 'scandal', `${attackerName} took a bite out of ${victimName}'s foot during the famine. ${victimName} is not amused.`);
    // The bitten settler is the wronged party; a failed lunge only sours the friendship.
    startFeud(state, victim, attacker, Famine.BITE_FEUD_AMOUNT);
  } else {
    addNotification(state, '🍖 Desperate times', `${attackerName} tried to eat ${victimName}'s foot. ${victimName} backed away quickly.`, 'warning');
    logEvent(state, 'scandal', `${attackerName} tried to eat ${victimName}'s foot during the famine. The attempt failed.`);
  }
}