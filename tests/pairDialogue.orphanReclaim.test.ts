/**
 * Paired-dialogue orphan reclaim — regression for the 2026-09-20 audit findings F-chat-1 / F-chat-2.
 *
 * The state that was broken: `showDialogueStep` hands the visible line to one half of a pair and
 * `clearEntityChat`s the other, so the **idle half** has `chatTicks === 0` while still holding
 * `chatDialogueSessionKey`. `isDialogueBusy` reads the key, so that half is busy — but `tickHumanChat`
 * used to return on the counter before it looked at the session, and `resetDialogueSessions()` (called
 * by `resetRendererCaches()` on boot and on every session swap / save load) empties the session map.
 * The idle half was then stranded as dialogue-busy forever: excluded from greetings, workplace banter
 * and ambient pairing, with no path back.
 *
 * `tests/low-6-care-chat.test.ts:198-232` only covers the self-healing direction (a forced phrase while
 * the partner still has `chatTicks > 0`, released when that line expires). These cases cover the
 * direction that was broken, plus the counterpart release that a resolver now performs immediately.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { EntityType } from '../src/game/gameTypes';
import type { Entity } from '../src/game/gameTypes';
import {
  isDialogueBusy,
  resetDialogueSessions,
  sayHumanChatPhrase,
  startDialogueTreeChat,
  tickHumanChat,
} from '../src/game/humanChat';
import { getDialogueTreeById } from '../src/game/dialogueTrees';
import { killHuman } from '../src/game/humanLifecycleCleanup';
import { transformToWerewolfForm } from '../src/game/moonHowler';

/** Minimal human entity: `killHuman` needs `alive` + `type`, the chat code only the id. */
function human(id: number): Entity {
  return {
    id,
    type: EntityType.Human,
    alive: true,
    x: 0,
    y: 0,
    energy: 50,
    maxEnergy: 100,
    size: 10,
    speed: 2,
    vx: 0,
    vy: 0,
    flash: 0,
    childrenIds: [],
  } as unknown as Entity;
}

function rockTree() {
  const tree = getDialogueTreeById('dt_rock');
  expect(tree).toBeDefined();
  return tree!;
}

/**
 * Start a pair dialogue and run it until the second line — the hand-off, where `idle` has its visible
 * line cleared but keeps the session key. Returns resolvers for both halves.
 */
function advanceToHandOff(idle: Entity, speaking: Entity): {
  resolveIdle: (id: number) => Entity | undefined;
  resolveSpeaking: (id: number) => Entity | undefined;
} {
  const resolveIdle = (id: number) => (id === speaking.id ? speaking : undefined);
  const resolveSpeaking = (id: number) => (id === idle.id ? idle : undefined);

  startDialogueTreeChat(idle, speaking, rockTree());
  const firstLineTicks = idle.chatTicks ?? 0;
  expect(firstLineTicks).toBeGreaterThan(0);

  for (let i = 0; i < firstLineTicks; i++) {
    tickHumanChat(idle, resolveIdle);
    tickHumanChat(speaking, resolveSpeaking);
  }
  return { resolveIdle, resolveSpeaking };
}

afterEach(() => {
  resetDialogueSessions();
});

describe('paired dialogue — idle half reclaim (F-chat-1)', () => {
  it('releases the idle half when a session swap drops its session map entry', () => {
    resetDialogueSessions();
    const idle = human(41);
    const speaking = human(42);
    advanceToHandOff(idle, speaking);

    // Premise: the idle half shows no line, yet its session key keeps it busy.
    expect(idle.chatTicks ?? 0).toBe(0);
    expect(idle.chatDialogueSessionKey).toBe('41:42');
    expect(isDialogueBusy(idle)).toBe(true);
    expect(isDialogueBusy(speaking)).toBe(true);

    // What `resetRendererCaches()` does on boot and on every session swap / save load.
    resetDialogueSessions();

    // The idle half's own tick is the only thing that can reclaim it: its partner is the half that
    // owns the visible line, and a missing map entry makes `resolveSessionEntities` return null.
    tickHumanChat(idle);

    expect(idle.chatDialogueSessionKey).toBeUndefined();
    expect(idle.chatPartnerId).toBeUndefined();
    expect(isDialogueBusy(idle)).toBe(false);
  });

  it('releases the counterpart in the same call when a forced phrase ends the session', () => {
    resetDialogueSessions();
    const idle = human(51);
    const speaking = human(52);
    const { resolveSpeaking } = advanceToHandOff(idle, speaking);

    expect(speaking.chatTicks ?? 0).toBeGreaterThan(0);
    expect(isDialogueBusy(idle)).toBe(true);

    // Resolver supplied: no tick may be needed for the counterpart to be let go.
    sayHumanChatPhrase(speaking, 'A forced line', 12, resolveSpeaking);

    expect(speaking.chatTicks ?? 0).toBeGreaterThan(0);
    expect(speaking.chatDialogueSessionKey).toBeUndefined();
    expect(idle.chatDialogueSessionKey).toBeUndefined();
    expect(idle.chatPartnerId).toBeUndefined();
    // The idle half's counter was already 0, so only the released key can make this false.
    expect(isDialogueBusy(idle)).toBe(false);
  });

  it('releases a surviving idle half when its partner dies', () => {
    resetDialogueSessions();
    const survivor = human(61);
    const dying = human(62);
    const entityById = new Map<number, Entity>([
      [survivor.id, survivor],
      [dying.id, dying],
    ]);
    advanceToHandOff(survivor, dying);

    expect(dying.chatTicks ?? 0).toBeGreaterThan(0);
    expect(isDialogueBusy(survivor)).toBe(true);

    // `finalizeHumanDeath` → `cleanupEntityDialogueState`: the live-entity lookup is in scope, so the
    // survivor is released as part of the death, not one tick later by its own reclaim.
    killHuman(dying, [], entityById, 1_000);

    expect(dying.alive).toBe(false);
    expect(survivor.chatDialogueSessionKey).toBeUndefined();
    expect(survivor.chatPartnerId).toBeUndefined();
    expect(isDialogueBusy(survivor)).toBe(false);
  });

  /**
   * The residual the hoisted reclaim could not reach, and the reason it needs a different instrument.
   *
   * A live entry is invisible to a map-presence reclaim, and the idle half can never advance it. So
   * when the *active* half stops being ticked, the pair froze for as long as that lasted. The
   * production trigger is the Moon Howler: `transformToWerewolfForm` sets `type = Werewolf`, and
   * `tickHumanChat`'s only two callers are inside the `byType[EntityType.Human]` loop.
   *
   * Releasing at the moment the entity leaves the population is the only correct fix here: a stall
   * bound cannot be tightened below the longest legitimate line (`ticksForDialogueLine` reaches ~35
   * ticks for a full three-line bubble) without cutting real conversations, and a night is only ~30.
   */
  it('releases the pair when the speaking half transforms into a Moon Howler', () => {
    resetDialogueSessions();
    const idle = human(71);
    const speaking = human(72);
    const { resolveIdle } = advanceToHandOff(idle, speaking);

    // Premise: a live pair whose active half owns the visible line.
    expect(speaking.chatTicks ?? 0).toBeGreaterThan(0);
    expect(isDialogueBusy(idle)).toBe(true);

    // Leaving `byType[EntityType.Human]`: from here `tickHumanChat` never runs for this entity, so
    // it can no longer decrement its line or advance the session.
    transformToWerewolfForm(speaking, []);

    expect(speaking.type).toBe(EntityType.Werewolf);
    expect(speaking.chatDialogueSessionKey).toBeUndefined();

    // The idle half's own next tick is what frees it — its session entry is gone, which is the one
    // condition the hoisted reclaim can act on. Before the fix the entry was live, so this changed
    // nothing and the settler stayed dialogue-busy.
    tickHumanChat(idle, resolveIdle);

    expect(idle.chatDialogueSessionKey).toBeUndefined();
    expect(idle.chatPartnerId).toBeUndefined();
    expect(isDialogueBusy(idle)).toBe(false);
  });
});
