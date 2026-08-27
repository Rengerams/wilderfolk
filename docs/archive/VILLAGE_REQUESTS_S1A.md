# Village Requests — S1a Vertical Slice

**Status:** Active feature proposal for v0.6.2.1  
**Scope:** One complete request type — **Caravan Provisions Offer** — rather than a broad event system.  
**Primary owner:** `groupEvents.ts`  
**Generation / expiry cadence:** New-calendar-day through `tickLayerDaily.ts`  
**Player-choice cadence:** Typed `resolveVillageRequest` command through `commands.ts` and `applyWorkerCommand()`

> This feature turns a current visitor into one small, readable decision. It does not create another event manager, economy manager, trade system, festival owner, or relationship owner.

## Player experience

When a trader caravan is present and the request cooldown has passed, the caravan leader may offer emergency provisions. The request card says who is offering, what the village receives, what it costs, and when the offer expires. The player can **Accept** or **Decline**. A valid choice produces an immediate resource/reputation result, floating feedback, and a Chronicle entry. If the caravan departs first, the request visibly expires instead of silently changing anything.

| Request | Cause the player can understand | Choice | Immediate result | Visible resolution |
|---|---|---|---|---|
| **Caravan Provisions Offer** | A live trader caravan has arrived and the village has no other active request. | Accept the offer | Pay **15 gold**, receive **30 food**, gain **+2 reputation**. | Food/gold float at the caravan camp; Chronicle trade entry; card closes. |
| | | Decline politely | No resource transfer; lose **1 reputation**. | Grey decline float; Chronicle event entry; card closes. |
| | | Wait too long | No resource transfer or reputation change. | Amber expiry float; Chronicle event entry; card closes. |

The exact values are first-slice balance values, not a new trade-economy framework. They must remain in one catalog constant and are intentionally modest.

## Ownership and cadence

| Decision | Sole owner | Cadence | Allowed writes | Explicit non-owner |
|---|---|---|---|---|
| Offer generation, expiry, accepted/declined resolution | `groupEvents.ts` | New calendar day | `activeVillageRequest`, request cooldown/history, the documented resource/reputation result, event/feedback fields, source caravan’s completed-trade counter | React UI, renderer, `gameTick.ts`, a new event manager |
| Player choice validation and dispatch | `commands.ts` → `groupEvents.resolveVillageRequest` | Player command | No independent writes; it delegates to the request owner | UI component and `GameWorkerHost` |
| Resource-cap enforcement | `resourceUtils.ts` / existing resource helpers | Called by request owner during resolution | Existing `resources` only | UI preview |
| Caravan arrival and departure | Existing visitor group owner in `groupEvents.ts` | Daily | `visitorGroups` | Village Request logic |

`tickLayerDaily.ts` calls the request owner only after visitor groups have advanced, so departure is visible before a request can be generated from that caravan. The request owner never loops in realtime and never performs a population-wide search.

## State contract

The first slice stores one optional top-level request record. It is explicit enough to save, worker-sync, roll back, render, and test without a generic event framework.

| Field | Type | Purpose |
|---|---|---|
| `activeVillageRequest` | `VillageRequest \| undefined` | The single active player decision. |
| `activeVillageRequest.id` | `string` | Stable command validation target. |
| `activeVillageRequest.kind` | `'caravan_provisions'` | Narrow first-slice request type. |
| `activeVillageRequest.sourceVisitorGroupId` | `string` | The caravan that made the offer. |
| `activeVillageRequest.title`, `description`, `emoji` | `string` | Read-only UI and Chronicle copy derived at generation. |
| `activeVillageRequest.createdDay`, `expiresDay` | `number` | Daily expiry and stale-command protection. |
| `activeVillageRequest.choices` | Explicit `accept` / `decline` metadata | UI displays values that the authoritative resolver validates independently. |
| `villageRequestCooldownUntilDay` | `number?` | Stops request spam after any resolution or expiry. |
| `villageRequestHistory` | Bounded summary array | Records up to the latest 20 resolutions for debugging and future player history. |

The new fields are compatible optional extensions to `WorldState`. They must be included in world initialization, simulation preparation/rollback, sim-delta transfer, save/load, and worker authoritative reconciliation before the UI is mounted.

## Generation, validity, and failure behavior

| Condition | Required behavior |
|---|---|
| No active request, cooldown elapsed, live trader caravan with days remaining | Generate at most one provisions offer on the daily gate. |
| An active request exists | Do not generate another request of any kind. |
| The source caravan leaves, is missing, or reaches zero days left | Expire the request on the daily gate with no reward or penalty. |
| Player accepts but now lacks 15 gold | Reject safely; retain the active request so the player can choose again before expiry. |
| Player accepts but food storage lacks 30 capacity | Reject safely; retain the request and explain that food storage is full. |
| Player sends an unknown request id or choice | Reject without mutation. |
| Player clicks twice / command repeats | First valid resolution closes the request; later command is a safe no-op. |
| Worker tick or command fails | Existing `simPrep` rollback restores the full request record and all request-owned state. |

## Command contract

```ts
{ proto: 1, op: 'resolveVillageRequest', requestId: string, choice: 'accept' | 'decline' }
```

The UI only dispatches this command through the existing game action path. It may show a disabled button for an unavailable choice, but the worker resolver validates every condition from authoritative `WorldState` again.

## UI contract

`VillageRequestCard` is a presentational component mounted beside existing global event banners. It receives the request snapshot and an `onResolve(requestId, choice)` callback. It cannot dismiss, alter, or create a request locally. The card must remain visible over ordinary Big News because it awaits a decision, while diplomacy and raid panels retain higher alert priority.

| UI element | Required content |
|---|---|
| Header | Caravan emoji, title, and source caravan name. |
| Why now | One concise sentence connecting the offer to the visiting caravan. |
| Accept button | Exact cost and reward: `Pay 15 gold → Receive 30 food, +2 reputation`. |
| Decline button | Exact consequence: `No trade; -1 reputation`. |
| Expiry | “Offer ends when the caravan leaves.” |
| Rejection feedback | Existing authoritative floating/big-news feedback only; no client-side success claim. |

## Tests and acceptance criteria

| Test group | Required coverage |
|---|---|
| Generation | Produces one offer from an eligible trader after cooldown; produces none when there is an active request, no trader, or cooldown. |
| Expiry | Missing/departed caravan closes the offer with no economic mutation. |
| Accept | Valid gold and food capacity produces the exact resource/reputation/caravan/event result. |
| Reject | Insufficient gold or capacity leaves the request open and leaves state unchanged except safe feedback. |
| Decline / idempotence | Decline resolves once; repeated/stale commands cannot duplicate a result. |
| Worker | Command shape validates; shared executor applies the same result; sim prep/delta preserve active request and rollback state. |
| UI | Card renders declared costs and dispatches only the typed action callback. |
| Performance | Daily candidate scan is over visitor groups only; record request count over 30 in-game days and confirm no realtime population scan. |

## Explicit non-goals

S1a does not add household construction priority, automatic temporary housing, request chains, promises, deferred festivals, seasonal preparation, personal relationship requests, or a general rule engine. Those require separate owner contracts after this vertical slice proves that player choice, worker authority, expiry, and player feedback all agree.

## Simulation Change Record

- **Owner module:** `groupEvents.ts`
- **Decision changed:** A live trader caravan may generate, expire, and resolve one provisions offer.
- **Cadence:** New-calendar-day generation/expiry; player-command resolution.
- **State fields written:** `activeVillageRequest`, request cooldown/history, existing resources/reputation, source caravan counters, ordinary event/feedback fields.
- **Why the change is needed:** Existing visitors and trade have value but rarely create a named, timed, readable player decision.
- **Player-visible behavior before:** A trader caravan can be selected and traded with, but does not offer one focused village-level decision card.
- **Player-visible behavior after:** A caravan can make one timed provisions offer with a transparent accept/decline outcome and a visible result.
- **Performance impact:** One daily scan over the bounded visitor-group list; no realtime or full-population work.
- **New or updated tests:** Village Request generation/resolution, command validation, worker prep/delta parity, UI card, full worker transport suite.
- **Invariants checked:** One active request maximum; source must remain live; invalid/stale commands cannot mutate state; request state survives worker rollback.
- **Save/migration impact:** Optional top-level fields; requires current beta save policy release review.
- **Rollback plan:** Remove the daily request-owner hook and command/card; existing visitor trade and caravan logic remain unchanged.
