
export const Social = {
  CLASS_LADDER_WEIGHTS: [26, 21, 16, 12, 9, 7, 5, 2.5, 1.2, 0.3],
} as const;

/**
 * Affair tryst tuning (owner: `simulation/humanRelationships.ts`, daily cadence).
 *
 * The base daily chance is a per-eligible-pair roll applied only after every
 * pairing gate has already passed (a compatible, non-spouse paramour in range, a
 * valid tryst site, the lower id leading the pair). Each success adds a progress
 * bump, and an affair is *established* only when both partners reach
 * AFFAIR_PROGRESS_MAX — only establishment can produce a scandal.
 */
export const Relationship = {
  AFFAIR_MIN_AGE: 18,
  AFFAIR_DAILY_TRYST_CHANCE_WITH_CHURCH: 0.07,
  AFFAIR_DAILY_TRYST_CHANCE_NO_CHURCH: 0.1,
  AFFAIR_CHURCH_FLOOR_FACTOR: 0.72,
  COURTSHIP_BASE_RATE_PER_HOUR: 4,
  COURTSHIP_WORK_RATE_FACTOR: 0.15,
  COURTSHIP_COOLDOWN_DAYS: 1,
  AFFAIR_FESTIVAL_MULTIPLIER: 1.4,
  AFFAIR_PERFORMERS_MULTIPLIER: 1.35,
  AFFAIR_COHABIT_MULTIPLIER: 1.55,
  AFFAIR_PROGRESS_BUMP_MIN: 16,
  AFFAIR_PROGRESS_BUMP_SPAN: 12,
  AFFAIR_PROGRESS_MAX: 100,
  SCANDAL_RUMOR_FEUD_SCORE: 20,
} as const;

export const Time = {
  /** 12 simulation ticks per clock hour give commuters finer steps without speeding up the real-time tick rate. */
  TICKS_PER_HOUR: 12,
  /** 24 = one calendar day per sim day; keeps all math in whole days. */
  HOURS_PER_DAY: 24,
  /** 360 = 4 seasons × 90 days; chosen over 365 so every season and year divide evenly. */
  DAYS_PER_YEAR: 360,
  /** 90 = DAYS_PER_YEAR / 4. A season is exactly a quarter of the year. */
  DAYS_PER_SEASON: 90,
} as const;

// Convenience top-level exports for common calendar math
export const DAYS_PER_YEAR = Time.DAYS_PER_YEAR;
export const HOURS_PER_DAY = Time.HOURS_PER_DAY;
export const DAYS_PER_SEASON = Time.DAYS_PER_SEASON;

/** Human needs & consumption tuning. */
export const Human = {
  /**
   * Roughly 3 food/adult/day follows 24h × 1.2 nutrition/h, modest
   * work/walking extras, and 10 nutrition restored per food in the needs owner.
   */
  DAILY_FOOD_CONSUMPTION: 3,
  /**
   * Foreign war captives retain the legacy four-hour meal check.
   * Player settlers use the nutrition intent and cooldown in humanPhysiology.ts.
   */
  MEAL_CHECK_INTERVAL_HOURS: 4,
  /**
   * Energy threshold only for foreign captive meals; not used for player nutrition.
   */
  HUNGER_MEAL_THRESHOLD: 0.9,
  /**
   * Legacy foreign captive energy restoration. Player meals credit nutrition via
   * HUMAN_NEEDS.NUTRITION_RESTORED_PER_FOOD_UNIT.
   */
  MEAL_ENERGY_RESTORE: 65,
} as const;

export const Immigration = {
  /** Ages a lone adult, or a couple's lead adult, can arrive with. */
  ADULT_AGE_MIN: 18,
  ADULT_AGE_MAX: 65,
  /**
   * A lone arrival this young is a youth. 12 is the floor the age owner already uses for youth
   * love and fertility, so such a settler can be courted but not married on arrival.
   */
  YOUTH_AGE_MIN: 12,
  YOUTH_AGE_MAX: 17,
  /** Chance an arriving party is one youth instead of an adult or a couple. */
  LONE_YOUTH_CHANCE: 0.1,
  /** Chance that an otherwise single arrival is a married couple. */
  COUPLE_CHANCE: 0.12,
  /** Chance the wife of an arriving couple is already expecting. */
  PREGNANT_WIFE_CHANCE: 0.4,
  /** Chance an arriving couple brings children (only when the colony has room for them). */
  FAMILY_WITH_CHILD_CHANCE: 0.6,
  /** Children are under `HUMAN_ADULT_MIN_AGE`, so they enrol at school and graduate there. */
  CHILD_AGE_MIN: 0,
  CHILD_AGE_MAX: 11,
  /** Up to two children per family; the caller's free-slot count caps it further. */
  FAMILY_MAX_CHILDREN: 2,
} as const;

/**
 * The age a settler must reach before school means anything.
 *
 * Owner (2026-09-29): *"well stages its not logic if a zero year old go to school"*, proposing the
 * ladder `0-2 baby / 2-6 toddler / 6-12 child / 12-18 juvenile`.
 *
 * School had **no minimum age at all**: `humanTick` gated the school run on `entity.isJuvenile` alone,
 * and that flag is `age < HUMAN_ADULT_MIN_AGE` (18) — true from birth. So a newborn was eligible for
 * a school shift and would walk to one whenever a school was in range; the only thing that ever
 * stopped it was the building being absent or too far, which is why it reads as an intermittent
 * absurdity rather than a constant one.
 *
 * 6 is the owner's own number for the start of the "child" band, and it is the first of their four
 * stages that implies schooling. Deliberately **not** a new global age ladder: the simulation's bands
 * stay as they are (`HUMAN_ADULT_MIN_AGE` = graduation = `HUMAN_ADULT_MIN_AGE` 18 = adult) and this
 * is one gate on one activity — a baby does not go to school. Turning the other three stages into real
 * mechanics is a separate, balance-affecting decision.
 */
export const SCHOOL_MIN_AGE = 6;

/** Tamed-animal care tuning. */
export const Animal = {
  /**
   * 0.15 = a tamed animal eats 15% of a human's daily portion (0.45 food/day).
   * Empirical — chosen by playtesting so a small herd (~5 pets) costs ~2 food/day
   * without out-competing the village pantry.
   */
  FOOD_RATIO_OF_HUMAN: 0.15,
} as const;

/**
 * Prison guard duty (owner: `prisonGuardDuty.ts`, daily cadence; roster: `prisonShifts.ts`).
 *
 * The roster owns the shifts — three nine-hour windows with a one-hour handover — and the guard count
 * that covers them. What stays tuning is the price of a gap: while the Prison holds prisoners and any
 * hour of the day has no guard on it, that hour carries this escape risk.
 */
export const Prison = {
  /**
   * 0.05 = per-unguarded-hour escape chance. Empirical/tuning: one guard of three leaves two shifts
   * open, which frees a prisoner most days.
   */
  ESCAPE_CHANCE_PER_UNGUARDED_HOUR: 0.05,
} as const;

/**
 * Valley ecology stage ladder (Stable → Strained → Damaged → Collapse).
 *
 * The single switch for the whole ladder: turn it off to park the valley at a quiet 'stable', with
 * no transitions, notifications, focus hints, or hunt/farm/illness effects.
 */
export const ValleyEcology = {
  ENABLED: true,
} as const;

/**
 * Famine desperation comedy (2026-09-08, developer joke feature).
 * When the larder is empty, the most desperate settler may lunge at a
 * neighbour's foot.
 */
export const Famine = {
  // The nutrition threshold for famine desperation is owned by HUMAN_NEEDS.
  /** Daily chance (per desperate settler) of attempting a foot-bite while stores are empty. */
  BITE_ATTEMPT_CHANCE: 0.15,
  /** Given an attempt, chance it actually lands (still comedy, still no harm). */
  BITE_SUCCESS_CHANCE: 0.4,
  /** Friendship lost when the attempt misses (victim is not amused). */
  BITE_FRIENDSHIP_HIT_MISS: 8,
  /** Friendship lost when the bite actually lands (victim is NOT amused). */
  BITE_FRIENDSHIP_HIT_SUCCESS: 16,
  /** Feud score the bitten settler opens against the biter when the bite lands. */
  BITE_FEUD_AMOUNT: 20,
} as const;

/**
 * In-app virtual player ("auto-play") tuning.
 *
 * Owner of the decisions: the player. The bot (`virtualPlayer.ts`) only proposes
 * one real `WorkerCommand` per in-game hour through the player's own command door.
 */
export const VirtualPlayer = {
  /**
   * 2 = build a food producer once stores drop below two days of settler need
   * (`settlers × Human.DAILY_FOOD_CONSUMPTION`).
   */
  FOOD_BUFFER_DAYS: 2,
  /** Proactively expand food production when the observed weekly balance is negative and stores cover fewer than 14 days. */
  FOOD_DEFICIT_RESPONSE_RUNWAY_DAYS: 14,
  /**
   * 8 = footprint-sized rings the placement search walks outward from the camp
   * centre before giving up.
   */
  PLACEMENT_SEARCH_RINGS: 8,
  /**
   * 0.8 = only a building below 80% health is worth a repair hour; anything
   * healthier is not damage a human would stop the colony for.
   */
  REPAIR_HEALTH_RATIO: 0.8,
  /**
   * 80 = below this treasury the Mine switches to the gold seam; above it, iron
   * (the forge always needs iron more than coin).
   */
  MINE_GOLD_TREASURY_GOLD: 80,
  /**
   * 9 = the in-game morning hour the bot may recruit a settler, so recruitment
   * can happen at most once a day instead of every hour.
   */
  RECRUIT_SETTLER_HOUR: 9,
  /** 2 = spare assignable beds the colony must have before buying a settler. */
  RECRUIT_MIN_OPEN_BEDS: 2,
  /**
   * 5 = days of settler food need kept in store before an optional spend
   * (recruiting, taming, a rival gift, or a peace treaty).
   */
  RECRUIT_FOOD_RESERVE_DAYS: 5,
  /**
   * 6 = days of settler food need above which spare food is sold to visitors.
   * Higher than `RECRUIT_FOOD_RESERVE_DAYS` so buying and selling food cannot
   * alternate hour after hour.
   */
  FOOD_SURPLUS_DAYS: 6,
  /** 5 = days of settler food need kept in store before taming a wild animal. */
  TAME_FOOD_RESERVE_DAYS: 5,
  /** 4 = days of settler food need kept in store before spending on a rival. */
  RIVAL_FOOD_RESERVE_DAYS: 4,
  /**
   * 3 = march provisions the colony must hold three times over before it raids,
   * so a war-band never leaves the village short of food.
   */
  RAID_FOOD_SURPLUS_MULT: 3,
  /** 5 = days of settler food need kept in store before welcoming a refugee camp. */
  REFUGEE_FOOD_RESERVE_DAYS: 5,
  /** 2 = spare assignable beds a refugee camp needs before it is welcomed. */
  REFUGEE_MIN_OPEN_BEDS: 2,
  /**
   * 260 = world pixels (roughly a dozen tiles) a production building must stand
   * from the village centre before the bot considers a road worth laying — roads
   * pay for a real walk, not for the building next door.
   */
  ROAD_MIN_LINK_DISTANCE: 260,
  /**
   * 120 = a road this close to a building already serves it, so the bot links a
   * different building instead.
   */
  ROAD_LINK_MAX_DISTANCE: 120,
  /**
   * 200 = wood kept back before paving: roads are a luxury, never a reason to
   * starve the builder's shelf.
   */
  ROAD_MIN_WOOD: 200,
  /**
   * 12 = road tiles one act may lay, so a single proposal stays a short chain the
   * player can watch appear.
   */
  ROAD_MAX_SEGMENTS_PER_ACT: 12,
  /**
   * 4000 = A* node budget for the road corridor, bounded so the decision stays
   * cheap on a big map.
   */
  ROAD_PATH_MAX_NODES: 4000,
  /**
   * 10 = settlers the colony must reach before the bot spends a building hour on a
   * community service (well, tavern, church, workshop, storage).
   *
   * A founding pair needs a house, food and a leader's house; a well or a tavern
   * before there is a village is a building a human would not raise yet. 10 is the
   * point where the settlement outgrows a single camp and the per-settler services
   * (`getWellCoverage`, storage caps, `ecosystemHealth`) start to bite.
   */
  COMMUNITY_MIN_SETTLERS: 10,
  /**
   * 3 = days of settler food need kept in store before the bot spends an hour on a
   * community service. Stricter than the general `FOOD_BUFFER_DAYS` (2) because a
   * service is optional: food, housing and repair all outrank it.
   */
  COMMUNITY_FOOD_RESERVE_DAYS: 3,
  /**
   * 3 = days of settler food need kept in store before the bot upgrades a completed
   * building. Nothing may raise a level out of the colony's lunch.
   */
  UPGRADE_FOOD_RESERVE_DAYS: 3,
  /**
   * 2 = the wood, stone and gold *multiple* of an upgrade's own price the colony must
   * hold before the bot will pay it (`getBuildingUpgradeCost` scales with level).
   * Keeping one upgrade's worth in reserve means an upgrade can never be the reason
   * the next house or farm cannot be built.
   */
  UPGRADE_COST_RESERVE_MULT: 2,
  /**
   * 60 = the ecosystem-health line the bot treats as "the ground needs help", so a Wildlife
   * Preserve is worth an hour (`decideCommunity`). It is the *same* 0–100 scale the Nature
   * window paints green above 60 and the leader's score rewards at 60 — stated here by name
   * rather than re-typed in the bot. Deliberately not extracted into a shared band constant:
   * the two readers compare `> 60` and `>= 60`, and unifying the operator is a balance call,
   * not this change's business.
   */
  ECOLOGY_HEALTHY_THRESHOLD: 60,
  /**
   * 2 = spare assignable beds the bot keeps in hand while the village is still small — the same
   * bar `RECRUIT_MIN_OPEN_BEDS` and `REFUGEE_MIN_OPEN_BEDS` already use for "there is room".
   */
  SPARE_BED_FLOOR: 2,
  /**
   * 0.25 = spare assignable beds kept at a quarter of the adult population, so a growing village
   * raises the next House before the first settler is homeless rather than after.
   */
  SPARE_BED_RATIO: 0.25,
  /**
   * 9 = a fully staffed Farm's nominal 27 food/day divided by roughly 3
   * food/adult/day. Actual throughput must still account for attendance.
   */
  SETTLERS_PER_FOOD_PRODUCER: 9,
  /**
   * A genuinely shrinking food store needs a more conservative planning ratio:
   * 5 adults per producer assumes roughly one staffed 17-food Farm, not a
   * permanently perfect three-person crew. Only used after a measured deficit.
   */
  DEFICIT_SETTLERS_PER_FOOD_PRODUCER: 5,
  /** Ignore daily food swings under 5% until a three-day history confirms them. */
  FOOD_DEFICIT_TOLERANCE_RATIO: 0.05,
  /**
   * 12 = settlers one wood, stone or iron producer serves. Bot policy, not a yield: building spend
   * scales with the village, so one producer per dozen adults keeps the shelves level with growth.
   */
  SETTLERS_PER_INDUSTRY_PRODUCER: 12,
} as const;
