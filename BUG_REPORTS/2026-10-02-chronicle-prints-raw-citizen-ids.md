# Name of file: 2026-10-02

- Bug: The chronicle prints raw citizen ids — `#5019 Maragret Hoke and #5758 Allen Galloway became sweethearts`
- Status: open
- Date discovered: 2026-10-02
- Version/build: 0.6.5.0, from a live export (New Frontier, Y2 D185, population 976)
- Reporter: agent, scanning the owner's exported chronicle
- Area: UI (chronicle text) / Truth
- Owner module: `src/game/citizenId.ts` — `formatCitizenName` is the UI **label** form; the chronicle writers want the prose form (`citizenFullName`)
- Cadence: every relationship, schooling and death line that goes through `formatCitizenName`

## Status history

- 2026-10-02 — open (160 of the export's 3433 events carry an id prefix; no fix applied)

## Observed behavior

In the exported chronicle (`wilderfolk-New-Frontier-chronicle.txt`, 3433 events covering 233 days):

```text
[Y2 D181] [event] #5019 Maragret Hoke and #5758 Allen Galloway became sweethearts
[Y2 D178] [death] #2984 Anika Parra died of a sudden illness — at the age of 36 years (adult)
[Y2 D177] [event] #4643 Homer Spann and #5364 Bonny Abell grew apart
[Y2 D…]   [event] The children at school are whispering that #662 Andres Andres sneaks out at night…
```

Measured by normalising `#\d+` and capitalised names out of the 3433 events:

| leaking line | events |
|---|---|
| `#N and #N became sweethearts` | 58 |
| `#N and #N became friends at school` | 38 |
| `N children at school are whispering that #N sneaks out at night…` | 20 |
| `#N finished basic schooling — ready to work` | 15 |
| `#N died of a sudden illness — at the age of NN years (adult)` | 19 |
| `#N graduated — bonus skills & stamina` | 2 |
| `#N and #N grew apart` | 1 |
| **total `#<id> <Name>` lines** | **160** |

(The export also contains 14 legitimate `(trip #2)` counters, which are not part of this.)

## Expected behavior

Prose in the chronicle names settlers the way every other line does — `Maragret Hoke and Allen
Galloway became sweethearts`. The id-prefixed form is a *UI label* (`citizenId.ts:56`: "Stable citizen
number — same as internal entity id, shown as `#123` in the UI"), for search results and the inspector,
where a stable handle is the point.

## Reproduction steps

1. Play until two settlers become sweethearts, or until a settler dies of illness.
2. Open the Chronicle (or export it).
3. The line carries `#<id>` before each name.

## Evidence

- The export above; the two line shapes are produced by
  `simulation/humanRelationships.ts:698` (sweethearts), `:665` (grew apart), `:436`/`:441`
  (the school whisper), `:956` (death via `formatDeathLog`), and `education.ts:235` (schooling lines),
  every one of them interpolating `formatCitizenName(...)`.
- `formatCitizenName` (`src/game/citizenId.ts:60-70`) always returns `` `${formatCitizenId(entity.id)} ${full}` ``,
  so an id prefix is guaranteed by construction, not by a caller mistake.
- `citizenFullName` (`src/game/citizenId.ts:50-54`) already exists and returns exactly the prose form
  (`Name Surname`, with the same nameless fallback) — nothing new is needed.
- `grep formatCitizenName(` finds 28 call sites; the ones on log paths are
  `humanRelationships.ts:436/491/618/665/698/944/957`, `humanNeeds.ts:90`, `education.ts:235`,
  `famineDesperation.ts:77-78`, `frontierCombat.ts:499/500/508/578/582`, `worldEvents.ts:86/349`.

## Root cause

A UI label formatter is being used to build simulation prose. `formatCitizenName` is the id-labelled
form on purpose (`citizenId.ts:56`, and the comment at `:61-64` records the fallback/trim decisions that
belong to the label), while the chronicle needs `citizenFullName`. The 160 lines in this export are all
in the relationship / schooling / death paths, which are exactly the paths that reach for it.

## Regression test

A text-level guard in the shape of `tests/uiSingleOwner.test.ts`: assert that the chronicle-writing call
sites (`humanRelationships`, `education`, `humanNeeds`, `frontierCombat`, `worldEvents`,
`famineDesperation`) do not call `formatCitizenName(`, and that `formatCitizenName` keeps its id prefix
for the UI surfaces that need it. A behavioural test is weaker here (the leak is in the string).

## Invariants checked

- *"A label is not prose"* — violated: the id prefix is a deliberate UI affordance leaking into
  player-readable history. `[verified]`
- *"One owner per rule"* — held for the fallback (`citizenGivenName`), broken for the *form*: two
  formatters that differ by one prefix, and the log paths picked the wrong one. `[verified]`

## Save/migration impact

None.

## Verification result

- Static: 160 leaking lines counted in the owner's export by normalised line shape; the formatters read
  at `citizenId.ts:28-70`; the writers located by grep.
- Not run: no browser/play session, no fix, so no test yet.

## Related commits or files

- `src/game/citizenId.ts` — `citizenFullName` (`:50`), `formatCitizenId` (`:56`), `formatCitizenName` (`:60`)
- `src/game/simulation/humanRelationships.ts` — `:441`, `:665`, `:698`, `:956`
- `src/game/education.ts:235`, `src/game/simulation/humanNeeds.ts:90`, `src/game/frontierCombat.ts:499+`,
  `src/game/worldEvents.ts:86/349`, `src/game/famineDesperation.ts:77-78`

## Fix

Not applied — it touches many call sites, so it is the owner's call how far to sweep. The minimal fix is
to switch the log-path call sites to `citizenFullName` (no new helper, no behaviour change); the wider
sweep is to make `formatCitizenName` reachable only from UI modules so the wrong choice cannot be made
again.
