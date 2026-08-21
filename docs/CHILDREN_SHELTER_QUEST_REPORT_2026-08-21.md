# Children Shelter Quest — v0.6.2.2

**Datum:** 2026-08-21  
**Status:** Implemented and validated  
**Owner:** Existing authoritative story-event flow in `src/game/storyEvents.ts`; daily resolution remains in `src/game/tickLayerDaily.ts`.

## Objective

Add a one-time authored story that can occur no earlier than colony day 10. Ten children arrive seeking five days of shelter. The player can help or refuse. The consequence is intentionally hidden at the decision point and is revealed only after the five-day interval.

## Implementation

The story uses the existing typed `StoryEvent` queue and `respondToStoryEvent` worker command. `maybeOfferChildrenShelter` gates the offer on colony day 10 and the existence of at least one rival settlement, while `storyFlags` prevent re-offering and store the authoritative start, expiry, decision, and resolution markers.

Helping is accepted only when at least ten free beds exist in completed player House or Mansion residences. Leader House and rival residences are excluded. The accepted story records the number of available residences used for the temporary shelter narrative and resolves after five `TICKS_PER_DAY` intervals. Refusal starts the same five-day interval without a shelter reservation. There is no partial mutation when the help choice cannot be accommodated.

After the interval, the first rival settlement is updated exactly once. Helping sets the rival to `friendly` and establishes a 180-day peace treaty. Refusing sets the rival to `tense`, clears the peace treaty, and resets its raid cooldown so the existing rival system can treat the relationship as hostile. Neither outcome is disclosed in the choice text.

## Authority and safety

The worker remains authoritative because the feature reuses the existing `respondToStoryEvent` command and the daily story cadence. No new clock, tick layer, entity lifecycle, population owner, or direct UI mutation was introduced. Invalid help due to insufficient beds restores the story event and leaves shelter state unset. Repeated daily resolution is blocked by `children_shelter_resolved`.

The temporary children are represented as a bounded story-level shelter reservation rather than permanent player entities. This avoids polluting population, workforce, family, mortality, and residence-occupant ownership with transient guests while still making the temporary house use visible through the authored news and notification.

## Validation

The focused story suite passed with **32 tests**. TypeScript test compilation, production build, ESLint, and `git diff --check` passed. The existing production circular-chunk warning (`game-render → game → game-render`) and large-chunk warning remain unchanged and are unrelated to this quest.

## Files changed

- `src/game/gameTypes.ts`
- `src/game/storyEvents.ts`
- `src/game/tickLayerDaily.ts`
- `tests/storyEvents.test.ts`
- `changelog.md`
- `docs/V0_6_2_2_ROADMAP.md`
- `docs/CHILDREN_SHELTER_QUEST_REPORT_2026-08-21.md`

## Remaining scope

The current slice uses a story-level reservation and does not spawn ten full transient human entities. This is deliberate to preserve the existing player-population and residence invariants. A future approved expansion could add visitor-entity rendering and movement, but that would require explicit lifecycle, worker delta, save/load, and cleanup design before implementation.

