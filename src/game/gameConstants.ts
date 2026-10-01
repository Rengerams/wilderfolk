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
 * Social-class spread for settler sprites — one distribution shared by the male and
 * female class ladders (female 2026-09-10, male 2026-09-16). Lower classes are common
 * in a frontier village; the gentry and aristocracy are rare. Weights are relative —
 * higher number = more common.
 *
 * Index order matches both class ladders in `humanSprites.ts` (lowest class first):
 * female 0 Mudlark · 1 Factory Hand · 2 Scullery Maid · 3 Pioneer · 4 Shop Assistant ·
 *        5 Governess · 6 Merchant's Wife · 7 Wealthy Gentry · 8 High Society · 9 Aristocrat
 * male   0 Poor Labourer · 1 Farmhand · 2 Craftsman · 3 Pioneer · 4 Shopkeeper ·
 *        5 Clerk · 6 Merchant · 7 Prosperous Farmer · 8 Wealthy Gentry · 9 Aristocrat
 *
 * Rationale: ~47% of villagers are the bottom two classes (mudlark/factory hand,
 * poor labourer/farmhand), while the top two (high society, aristocrat) make up ~1.5%,
 * so a rare grand dress or a gentleman's coat in the wilderness reads as a real event.
 * Both genders draw the same shape on purpose; split this into two entries only if a
 * designer wants the male and female distributions to differ.
 */
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
  /**
   * 18 = an affair is an *adult* relationship system, so both the cheater and the
   * paramour must already be adults. Ages 12–17 are the youth-love phase, where a
   * mutual youth-love pair is the only relationship and the only conception route
   * (see `YOUTH_LOVE_MIN_AGE` / `YOUTH_CONCEPTION_MULTIPLIERS`); leaving the affair
   * floor at the 16-year courtship age let a married adult take a 16–17-year-old
   * paramour and conceive with them outside the youth gate.
   */
  AFFAIR_MIN_AGE: 18,
  /** 0.07 = per-pair daily tryst chance while a church stands (was 0.14). */
  AFFAIR_DAILY_TRYST_CHANCE_WITH_CHURCH: 0.07,
  /** 0.1 = per-pair daily tryst chance with no church (was 0.20). */
  AFFAIR_DAILY_TRYST_CHANCE_NO_CHURCH: 0.1,
  /**
   * Church strength scales the base chance down toward this floor factor:
   * factor = FLOOR + (1 - churchStrength) × (1 - FLOOR), so a full-strength
   * church leaves 0.72 of the base chance and a weak church approaches 1.0.
   */
  AFFAIR_CHURCH_FLOOR_FACTOR: 0.72,
  /** Per in-game hour. 4/hour = 96 per 72-tick day, before the situational multipliers. */
  COURTSHIP_BASE_RATE_PER_HOUR: 4,
  /** Multiplier while on a work shift: courting continues, far slower, and never chases. */
  COURTSHIP_WORK_RATE_FACTOR: 0.15,
  /** In-game days before courting again after a courtship or marriage ends. */
  COURTSHIP_COOLDOWN_DAYS: 1,
  /** 1.4 = festivals loosen inhibitions (unchanged by the rebalance). */
  AFFAIR_FESTIVAL_MULTIPLIER: 1.4,
  /** 1.35 = visiting performers are a distraction (unchanged). */
  AFFAIR_PERFORMERS_MULTIPLIER: 1.35,
  /** 1.55 = a tryst at the paramour's own home is likelier to get that far. */
  AFFAIR_COHABIT_MULTIPLIER: 1.55,
  /** 16 = minimum progress one successful tryst adds, before multipliers. */
  AFFAIR_PROGRESS_BUMP_MIN: 16,
  /** 12 = span of the random extra progress above the minimum, so 16–27. */
  AFFAIR_PROGRESS_BUMP_SPAN: 12,
  /** 100 = progress both partners need before the affair is established. */
  AFFAIR_PROGRESS_MAX: 100,
  /** Feud score the cheated spouse opens against the paramour when a rumour reaches them. */
  SCANDAL_RUMOR_FEUD_SCORE: 20,
} as const;

export const Time = {
  /** 3 = simulation ticks per clock hour (provides smooth pathing and task interaction). */
  TICKS_PER_HOUR: 3,
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
  /**
   * 65 = one larder meal restores 65 of a settler's 500 max energy (about 13%
   * of the bar, or ~46 ticks / 15 h of unmodified metabolism at 1.4/tick).
   */
  MEAL_ENERGY_RESTORE: 65,
} as const;

/**
 * Daily immigration composition — owner `dailyPopulation.ts`, party shape built by
 * `worldGen.createImmigrantSettler`.
 *
 * A party is one of three shapes, rolled in this order: a **lone youth** (12–17), a **married
 * couple** (which may bring 1–2 children), or a **single adult**. The ages use the simulation's
 * own bands: under `HUMAN_CHILDHOOD_DAYS` (12) is a child (school, juvenile), 12–17 is a youth
 * (graduated, adult-sized, youth love, no marriage before `HUMAN_MOVE_OUT_MIN_AGE` = 18), and 18+
 * is an adult. A child therefore only ever arrives *with* both parents — never alone.
 */
export const Immigration = {
  /** Ages a lone adult, or a couple's lead adult, can arrive with. */
  ADULT_AGE_MIN: 18,
  ADULT_AGE_MAX: 55,
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
  /** Children are under `HUMAN_CHILDHOOD_DAYS`, so they enrol at school and graduate there. */
  CHILD_AGE_MIN: 2,
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
 * and that flag is `age < HUMAN_CHILDHOOD_DAYS` (12) — true from birth. So a newborn was eligible for
 * a school shift and would walk to one whenever a school was in range; the only thing that ever
 * stopped it was the building being absent or too far, which is why it reads as an intermittent
 * absurdity rather than a constant one.
 *
 * 6 is the owner's own number for the start of the "child" band, and it is the first of their four
 * stages that implies schooling. Deliberately **not** a new global age ladder: the simulation's bands
 * stay as they are (`HUMAN_CHILDHOOD_DAYS` 12 = graduation, `HUMAN_ADULT_MIN_AGE` 18 = adult) and this
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
 * While ENABLED is false the effective stage always reads 'stable' — no
 * transitions, notifications, focus hints, or hunt/farm/illness effects.
 */
export const ValleyEcology = {
  ENABLED: false,
} as const;

/**
 * Famine desperation comedy (2026-09-08, developer joke feature).
 * When the larder is empty, the most desperate settler may lunge at a
 * neighbour's foot.
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
} as const;
