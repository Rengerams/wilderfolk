import type { Building, Entity } from './gameTypes';
import { BuildingType, EntityType } from './gameTypes';
import { SPECIES_CONFIG } from './speciesConfig';
import { isPlayerHuman } from './playerHuman';

/**
 * The Hunting Spot's own rules: who works it, which animal it is after, how far it can *see*, and how
 * close the hunter must be to take the animal.
 *
 * Owner, 2026-09-30, asking why the hunter never went to the prey and then ruling on the reach:
 * *"120 px is way to far, its 1800's they dont have guns"*. Both halves are this module's job:
 *
 *  - **Seeing is not killing.** `HUNTING_SPOT_SEARCH_RADIUS_PX` is how far out an animal is *noticed* —
 *    the owner's own 350 px (*"the range can be 350 where is looking"*), which is also the wolf's
 *    `huntRange` in `speciesConfig`.
 *  - **Killing means standing next to it.** `huntingKillReach` is bodies touching, exactly the rule
 *    `humanHuntingBehavior.ts` already applies to a settler hunting for themselves (`config.size +
 *    prey.size`) and the same one the wolf uses when it mauls its catch (`tickLayerSystems`). A
 *    120 px reach was a gunshot: ~10 m at this scale (~11.76 px/m).
 *  - **And therefore the hunter has to walk.** With a contact reach, a hunter who stands at the post
 *    would never take anything, so `huntingSpotChaseTarget` is the move-to-prey order — the same thing
 *    the wolf does every tick in `tickLayerSystems` (`targetVx = (dx/dist) × speed`) and the free-roam
 *    hunter does in `humanHuntingBehavior` (`steerEntityToward`). The selection rule lives here and is
 *    read by *both* the shot (daily, `dailyBuildingEconomy`) and the walk (realtime, `humanTick`), so
 *    the hunter always walks toward the animal the spot is actually going to shoot.
 */

/** How far an assigned hunter notices prey, in px — the owner's 350. */
export const HUNTING_SPOT_SEARCH_RADIUS_PX = 350;

/**
 * The settler a building sends out — its first living, player-owned occupant.
 *
 * `occupants` is the assignment list, but a building constructed outside the normal path (tests, saves
 * from before a field existed) can reach here without one, so this reads it defensively.
 */
export function findLiveAssignedWorker(
  building: Building,
  entityById: ReadonlyMap<number, Entity>,
): Entity | undefined {
  const assigned = building.occupants;
  if (!assigned) return undefined;
  for (let i = 0; i < assigned.length; i++) {
    const worker = entityById.get(assigned[i]);
    if (worker?.alive && isPlayerHuman(worker)) return worker;
  }
  return undefined;
}

/** True while `hunter` is the settler this spot sends out. */
export function isHuntingSpotHunter(
  building: Building,
  hunter: Entity,
  entityById: ReadonlyMap<number, Entity>,
): boolean {
  if (building.type !== BuildingType.HuntingSpot || building.completed !== true) return false;
  return findLiveAssignedWorker(building, entityById)?.id === hunter.id;
}

/**
 * How close the hunter must be for the shot to have a chance: bodies touching, both radii.
 *
 * This is deliberately the *same expression* the free-roam rule uses in `humanHuntingBehavior.ts` —
 * `config.size + prey.size`, the hunter's radius from the species table and the prey's own radius off
 * the entity — rather than a second formula that would drift from it.
 */
export function huntingKillReach(hunter: Entity, prey: Entity): number {
  const hunterSize = SPECIES_CONFIG[hunter.type]?.size ?? hunter.size;
  const preySize = prey.size > 0 ? prey.size : (SPECIES_CONFIG[prey.type]?.size ?? 6);
  return hunterSize + preySize;
}

/**
 * The animal this spot is after right now, or null when there is nothing inside its eyes.
 *
 * The building's own prey setting (`huntingSpotPrey`) decides the candidate types; a tamed animal is
 * never a target. A wolf carries a +160 px penalty so a spot only picks one when nothing safer is
 * closer — walking up to a wolf is how hunters get bitten.
 */
export function pickHuntingSpotPrey(
  building: Building,
  hunter: Entity,
  byType: Record<EntityType, Entity[]>,
): Entity | null {
  const preyTarget = building.huntingSpotPrey ?? 'auto';

  const targetTypes: EntityType[] = [];
  if (preyTarget === 'auto' || preyTarget === 'deer') targetTypes.push(EntityType.Deer);
  if (preyTarget === 'auto' || preyTarget === 'rabbit') targetTypes.push(EntityType.Rabbit);
  if (preyTarget === 'auto' || preyTarget === 'wolf') targetTypes.push(EntityType.Wolf);

  let targetPrey: Entity | null = null;
  let bestScore = Infinity;
  for (let t = 0; t < targetTypes.length; t++) {
    const pool = byType[targetTypes[t]] ?? [];
    for (let p = 0; p < pool.length; p++) {
      const prey = pool[p];
      if (!prey.alive || prey.tamedBy != null) continue;
      const dist = Math.hypot(prey.x - hunter.x, prey.y - hunter.y);
      if (dist >= HUNTING_SPOT_SEARCH_RADIUS_PX) continue;
      const score = prey.type === EntityType.Wolf ? dist + 160 : dist;
      if (score < bestScore) {
        bestScore = score;
        targetPrey = prey;
      }
    }
  }
  return targetPrey;
}

/**
 * How far a committed animal may stray before the spot gives it up, in px — the eyes' radius plus the
 * length of the pursuit.
 *
 * A commitment that lapsed the moment the animal crossed `HUNTING_SPOT_SEARCH_RADIUS_PX` made the hunter
 * start over constantly: with a valley of deer around, the nearest fresh animal is always ~150–300 px
 * away, so the settler walked toward one target after another and was never beside any of them when the
 * shot was sampled (measured: 162 "Too far to shoot" floats over twelve colony days, no catch, and the
 * hunter ranging 306 px from its post). Being *seen* and being *hunted* are different distances, exactly
 * as looking and killing are.
 */
const HUNTING_SPOT_ABANDON_RADIUS_PX = HUNTING_SPOT_SEARCH_RADIUS_PX * 2;

/** Whether the spot's own prey setting allows this kind of animal at all. */
function isHuntableSpotPreyType(building: Building, prey: Entity): boolean {
  if (!prey.alive || prey.tamedBy != null) return false;
  const preyTarget = building.huntingSpotPrey ?? 'auto';
  return (
    preyTarget === 'auto' ||
    (preyTarget === 'deer' && prey.type === EntityType.Deer) ||
    (preyTarget === 'rabbit' && prey.type === EntityType.Rabbit) ||
    (preyTarget === 'wolf' && prey.type === EntityType.Wolf)
  );
}

/**
 * Whether a spot may keep the animal it already committed to: huntable, and not so far that the pursuit
 * has plainly failed (`HUNTING_SPOT_ABANDON_RADIUS_PX`).
 */
function mayKeepHuntingSpotTarget(building: Building, hunter: Entity, prey: Entity): boolean {
  if (!isHuntableSpotPreyType(building, prey)) return false;
  return Math.hypot(prey.x - hunter.x, prey.y - hunter.y) < HUNTING_SPOT_ABANDON_RADIUS_PX;
}

/**
 * The animal this spot is after: the one it is **committed** to while the pursuit still makes sense,
 * otherwise the nearest it can see.
 *
 * The commitment is what makes a chase possible, and its two radii are deliberately different. Picking
 * the nearest candidate fresh every tick meant a hunter in a herd changed its mind continuously and
 * converged on nothing — measured with the real workforce assignment and 21 deer in the world: the pick
 * cycled #357 → #431 → #452 within one day and the hunter never got closer than ~150 px. Dropping the
 * commitment at the *eyes'* radius was just as bad in the other direction: the animal stepped outside
 * 350 px, the spot picked a fresh one 200 px away, and the settler spent its life walking between them
 * (162 "Too far to shoot" floats, no catch). So a commitment survives out to
 * `HUNTING_SPOT_ABANDON_RADIUS_PX` — seeing is 350 px, hunting what you have already chosen lasts
 * longer.
 */
export function huntingSpotTarget(
  building: Building,
  hunter: Entity,
  entityById: ReadonlyMap<number, Entity>,
  byType: Record<EntityType, Entity[]>,
): Entity | null {
  const committedId = building.huntingSpotTargetId;
  if (committedId != null) {
    const committed = entityById.get(committedId);
    if (committed && mayKeepHuntingSpotTarget(building, hunter, committed)) return committed;
  }
  return pickHuntingSpotPrey(building, hunter, byType);
}

/** Record the spot's choice (or clear it) — the owner of the decision writes it; everyone else reads. */
export function commitHuntingSpotTarget(building: Building, prey: Entity | null): void {
  building.huntingSpotTargetId = prey ? prey.id : undefined;
}

/**
 * The animal this hunter should be walking to right now, or null when there is nothing to walk to —
 * either no prey is in sight, or the hunter is already close enough to take it.
 *
 * "Close enough to walk no further" is deliberately **tighter** than the kill reach
 * (`HUNTING_PURSUIT_CLOSE_FRACTION`): the hunter closes to well inside the gate and holds there, so an
 * animal wandering a few px per tick does not open the gate before the spot's production tick samples
 * it. That sampling is exactly what defeated the first attempt at a contact reach — with a standing
 * hunter, a fixture deer drifted from 30 px to 34.5 px against a 22 px reach and the spot stopped
 * producing food altogether (`dailyBuildingEconomy`'s old comment recorded it).
 */
export function huntingSpotChaseTarget(
  building: Building,
  hunter: Entity,
  entityById: ReadonlyMap<number, Entity>,
  byType: Record<EntityType, Entity[]>,
): Entity | null {
  if (!isHuntingSpotHunter(building, hunter, entityById)) return null;
  const prey = huntingSpotTarget(building, hunter, entityById, byType);
  if (!prey) return null;
  const holdDistance = huntingKillReach(hunter, prey) * HUNTING_PURSUIT_CLOSE_FRACTION;
  const dist = Math.hypot(prey.x - hunter.x, prey.y - hunter.y);
  return dist > holdDistance ? prey : null;
}

/**
 * How fast the hunter closes, as a multiple of their walk.
 *
 * Not because prey flee — they do not; the only `flee` in the simulation is a human's, from an active
 * Moon Howler (`combat.ts:106`) — but because they **wander faster than a working settler walks**. The
 * measured species speeds are rabbit 3.5, deer 3.0, wolf 4.0 and human 3.0 px/tick (`speciesConfig`),
 * and a settler on the job has their walk damped to 0.85 of it (`humanTick`: `if (!allowFreeRoam &&
 * onSchedule) { vx *= 0.85; vy *= 0.85; }`), i.e. **2.55 px/tick** — slower than every animal a spot
 * hunts. That is measurable, not theoretical: with the plain walk the hunter chased for four colony days
 * and never got closer than 91 px, taking nothing. 1.4 puts a working hunter at ~3.6 px/tick, just above
 * the fastest prey it is allowed to pick and still below the wolf (4.0) it is told to leave alone.
 */
export const HUNTING_PURSUIT_SPEED_MULT = 1.4;

/**
 * How many ticks ahead of the animal the hunter aims — the difference between a chase that closes and
 * one that treadmills.
 *
 * Steering at the animal's *current* position means every px it wanders away is chased from behind, and
 * with prey at 3.0–3.5 px/tick against a damped working walk that cancels most of the closing (measured:
 * four colony days, closest 65 px, nothing taken). Aiming where it is *going* removes the radial part of
 * its motion, which is the part that fights the hunter. `3` is roughly how long a settler's step takes to
 * matter at this scale — enough lead to cut the corner, not so much that the hunter overshoots a turn.
 */
export const HUNTING_LEAD_TICKS = 3;

/**
 * How long a hunter's contact with an animal stays good for, in ticks.
 *
 * The spot resolves its shot on its own production pass, which samples a single instant; the hunter is
 * beside a wandering animal for a stretch of ticks and back at its post for others, and those instants
 * simply never coincided — measured, 162 "Too far to shoot" decisions over twelve colony days, every one
 * of them in the small hours with the hunter at its post, and not one catch despite the hunter having
 * closed to 10 px during the day. A contact is therefore *recorded* when it happens
 * (`huntingSpotInReachTick`) and the pass accepts a recent one. 12 ticks is about four in-game hours
 * (`TICKS_PER_HOUR` is 3): long enough to bridge the walk home and back, short enough that an animal
 * which has genuinely gone is not shot at.
 */
export const HUNTING_SPOT_STRIKE_GRACE_TICKS = 12;

/** True when the hunter was beside this spot's animal recently enough for the shot to count. */
export function isHuntingStrikeLive(building: Building, tick: number): boolean {
  const at = building.huntingSpotInReachTick;
  return at != null && tick - at <= HUNTING_SPOT_STRIKE_GRACE_TICKS;
}

/**
 * Where the hunter should actually steer: the animal's position, led by its own velocity.
 *
 * The animal's own `vx`/`vy` are the sim's record of its heading (`tickLayerSystems` writes them for
 * every mobile entity), so this reads the heading rather than predicting anything.
 */
export function huntingPursuitPoint(prey: Entity): { x: number; y: number } {
  return {
    x: prey.x + prey.vx * HUNTING_LEAD_TICKS,
    y: prey.y + prey.vy * HUNTING_LEAD_TICKS,
  };
}

/** The hunter holds at this fraction of the kill reach, so prey drift cannot open the shot gate. */
const HUNTING_PURSUIT_CLOSE_FRACTION = 0.6;

/**
 * The wolf's fight-back: the chance it turns on the hunter instead of being taken, and what the bite
 * costs. **These are the numbers that were already here** (`isWolf && seededRandomForRun(...) < 0.35`),
 * kept exactly — the owner's reminder was *"dont forget animals fight back"*, not a request for new
 * odds, and the 85 % accuracy roll next to it is the hunter's own chance of winning the exchange.
 *
 * One consequence did have to change: the bite now lands on the **hunter** rather than on the Hunting
 * Spot. The old branch took 12 health off the building from a wolf the settler was never near (the shot
 * could be taken from 320 px); now that the hunter walks up to the animal, they are the one in range. A
 * settler's health *is* its energy — `worldEvents` applies damage as `energy = max(0, energy - N)`, and
 * the human loop's exhaustion path is what kills at zero.
 */
export const HUNTING_FIGHT_BACK_CHANCE = 0.35;
export const HUNTING_FIGHT_BACK_BITE_ENERGY = 140;

