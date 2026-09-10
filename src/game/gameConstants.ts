/**
 * Central game constants — the ONE place to change gameplay values.
 *
 * Rules (see docs/CONSTANTS_GUIDELINE.md and docs/plans/constant-centralization-plan.md):
 * - Every gameplay constant (windows, multipliers, thresholds, intervals) is
 *   declared here in a labelled section and imported by name everywhere else.
 * - No gameplay constant is declared mid-file or inside a function body.
 * - Every entry explains WHY that magnitude (why 6 and not 20) — derivation,
 *   cadence anchor, or a playtest note ("tuned by testing: 4 too tight, 8 too
 *   easy, 6 was right"). Where no honest reason exists yet the entry is marked
 *   `TODO(tuning)` and sits on the balance backlog.
 * - Files that historically exported a constant keep a thin re-export so
 *   existing importers don't change, but the value itself lives here.
 */

/**
 * Social-class spread for female settler sprites (2026-09-10, developer).
 * Lower classes are common in a frontier village; the gentry and aristocracy
 * are rare. Weights are relative — higher number = more common.
 *
 * Index order matches the female class sprite ladder in `humanSprites.ts`:
 * 0 Mudlark · 1 Factory Hand · 2 Scullery Maid · 3 Pioneer ·
 * 4 Shop Assistant · 5 Governess · 6 Merchant's Wife ·
 * 7 Wealthy Gentry · 8 High Society · 9 Aristocrat
 *
 * Rationale: ~47% of village women are the bottom two classes (mudlark,
 * factory hand), while the top two (high society, aristocrat) make up ~1.5%,
 * so a rare grand dress in the wilderness reads as a real event.
 */
export const Social = {
  FEMALE_CLASS_WEIGHTS: [26, 21, 16, 12, 9, 7, 5, 2.5, 1.2, 0.3],
} as const;

export const Time = {
  /** 24 = one real day per sim day; the calendar below keeps all math in whole days. */
  HOURS_PER_DAY: 24,
  /** 360 = 4 seasons × 90 days; chosen over 365 so every season and year divide evenly. */
  DAYS_PER_YEAR: 360,
  /** 90 = DAYS_PER_YEAR / 4. A season is exactly a quarter of the year. */
  DAYS_PER_SEASON: 90,
} as const;

/** Human needs & consumption tuning. */
export const Human = {
  /**
   * 3 = one meal per meal-check window across the waking day (08:00/12:00/16:00
   * checks in the default window); a family of ~3 eats ~9/day, which farms of
   * the default cadence are tuned to cover.
   */
  DAILY_FOOD_CONSUMPTION: 3,
  /**
   * 4 = hunger is re-evaluated every 4 clock hours (6 checks/day); only 3 of
   * them fall inside the standard 07–16 work window, matching DAILY_FOOD_CONSUMPTION.
   */
  MEAL_CHECK_INTERVAL_HOURS: 4,
  /**
   * 0.9 = eat only when energy has dipped below 90% max; stops settlers from
   * grazing food the moment they lose a single point.
   */
  HUNGER_MEAL_THRESHOLD: 0.9,
} as const;

/** Tamed-animal care tuning. */
export const Animal = {
  /**
   * 0.15 = a tamed animal eats 15% of a human's daily portion (0.45 food/day).
   * Empirical — chosen by playtesting so a small herd (~5 pets) costs ~2 food/day
   * without out-competing the village pantry. Test note: exact comparison values
   * (0.1 vs 0.2) were not recorded.
   */
  FOOD_RATIO_OF_HUMAN: 0.15,
} as const;

/**
 * Prison guard duty (owner: `prisonGuardDuty.ts`, daily cadence).
 *
 * Player design (2026-09-08): one staffed guard covers an 8-hour shift, so a
 * completed Prison needs 3 guards for full 24 h coverage. While the Prison
 * holds prisoners and coverage is below 24 h, each unguarded hour carries an
 * escape risk. v1 keeps it soft — an "escape" frees one prisoner early and the
 * settler stays in the colony (no removal/cleanup).
 */
export const Prison = {
  /** 8 = one guard's shift length in hours. */
  GUARD_SHIFT_HOURS: 8,
  /** 3 = HOURS_PER_DAY(24) / GUARD_SHIFT_HOURS(8) — guards for round-the-clock coverage. */
  GUARDS_FOR_FULL_COVERAGE: 3,
  /**
   * 0.05 = per-unguarded-hour escape chance. Empirical/tuning: with 1 guard
   * (16 unguarded hours) this frees a prisoner roughly half the days, which
   * reads as a real consequence without emptying the cell every night.
   */
  ESCAPE_CHANCE_PER_UNGUARDED_HOUR: 0.05,
} as const;

/**
 * Valley ecology stage ladder (Stable → Strained → Damaged → Collapse).
 *
 * PARKED 2026-09-08 (developer): the strain messages had no player agency and
 * no real consequences, so the ladder is dormant until it is rebalanced.
 * While ENABLED is false the effective stage always reads 'stable' — no
 * transitions, notifications, focus hints, or hunt/farm/illness effects.
 * Set ENABLED back to true to fully re-activate; no other code change needed.
 */
export const ValleyEcology = {
  ENABLED: false,
} as const;

/**
 * Famine desperation comedy (2026-09-08, developer joke feature).
 * When the larder is empty, the most desperate settler may lunge at a
 * neighbour's foot. Non-lethal — no health/energy damage — but the victim is
 * not amused, so the pair's friendship drops. Values are playtest-flavoured:
 * low enough to be a rare joke, not a daily ritual.
 */
export const Famine = {
  /** Only a settler this far below max energy is desperate enough to try a bite. */
  BITE_DESPERATE_ENERGY_RATIO: 0.3,
  /** Daily chance (per desperate settler) of attempting a foot-bite while stores are empty. */
  BITE_ATTEMPT_CHANCE: 0.15,
  /** Given an attempt, chance it actually lands (still comedy, still no harm). */
  BITE_SUCCESS_CHANCE: 0.4,
  /** Friendship lost when the attempt misses (victim is not amused). */
  BITE_FRIENDSHIP_HIT_MISS: 8,
  /** Friendship lost when the bite actually lands (victim is NOT amused). */
  BITE_FRIENDSHIP_HIT_SUCCESS: 16,
} as const;
