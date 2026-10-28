import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalDialogueBank, getDialogueTreeById, installDialogueBankPayload, requestDialogue } from '../src/game/dialogueTrees';
import { isDialogueBusy, resetDialogueSessions, tickHumanChat, type ChatSpeaker } from '../src/game/humanChat';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';
import { initGame } from '../src/game/worldGen';
import { resetSimRng } from '../src/game/simRng';

beforeEach(() => { resetDialogueSessions(); resetSimRng(); });
afterEach(() => { resetDialogueSessions(); resetSimRng(); });

describe('main/worker and old-save dialogue compatibility', () => {
  it('installs identical keyed source content after a worker message serialization boundary', () => {
    const worker = readFileSync(new URL('../src/game/simWorker/gameWorker.ts', import.meta.url), 'utf8');
    expect(worker).toContain('installDialogueBankPayload(canonicalDialogueBank)');
    const snapshot = JSON.parse(JSON.stringify(canonicalDialogueBank)) as typeof canonicalDialogueBank;
    installDialogueBankPayload(snapshot);
    expect(snapshot.dialogue_trees.map((scene) => scene.id))
      .toEqual(canonicalDialogueBank.dialogue_trees.map((scene) => scene.id));
    const id = 'evt_hospital_doctor_0';
    expect(getDialogueTreeById(id)?.lines).toEqual(canonicalDialogueBank.dialogue_trees.find((scene) => scene.id === id)?.lines);
    installDialogueBankPayload(canonicalDialogueBank);
  });

  it('reloads a real save without retaining an unrecoverable dialogue session lock', () => {
    const world = initGame({ seed: 74211 });
    const speaker = world.entities.find((entity) => entity.alive && entity.type === 'human');
    expect(speaker).toBeDefined();
    if (!speaker) return;
    expect(requestDialogue({ eventKey: 'hospital.doctor', speaker, tick: world.tick })).toBe(true);
    const payload = buildSaveData(world, createInitialView(world.width, world.height));
    expect(Array.isArray(payload.entities)).toBe(true);
    const restored = loadGameFromParsedOutcome(JSON.parse(JSON.stringify(payload)) as Record<string, unknown>);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    const entity = restored.world.entities.find((candidate) => candidate.id === speaker.id);
    expect(entity).toBeDefined();
    if (!entity) return;
    resetDialogueSessions();
    tickHumanChat(entity);
    expect(entity.chatDialogueSessionKey).toBeUndefined();
    expect(isDialogueBusy(entity)).toBe(false);
  });
  it('selects identical captions and durations from serialized worker and main banks', () => {
    const snapshot = JSON.parse(JSON.stringify(canonicalDialogueBank)) as typeof canonicalDialogueBank;
    const workerSpeaker: ChatSpeaker = { id: 3101 };
    installDialogueBankPayload(snapshot);
    expect(requestDialogue({
      eventKey: 'hospital.doctor', speaker: workerSpeaker, tick: 302, selectionRoll: 0.75,
    })).toBe(true);
    const workerLine = workerSpeaker.chatPhrase;
    const workerTicks = workerSpeaker.chatTicks;
    resetDialogueSessions();

    installDialogueBankPayload(canonicalDialogueBank);
    const mainSpeaker: ChatSpeaker = { id: 3101 };
    expect(requestDialogue({
      eventKey: 'hospital.doctor', speaker: mainSpeaker, tick: 302, selectionRoll: 0.75,
    })).toBe(true);
    expect(mainSpeaker.chatPhrase).toBe(workerLine);
    expect(mainSpeaker.chatTicks).toBe(workerTicks);
    expect(mainSpeaker.chatDialogueSessionKey).toBe(workerSpeaker.chatDialogueSessionKey);
  });

  it('reclaims both partners after a real paired-dialogue save and load', () => {
    const world = initGame({ seed: 74212 });
    const humans = world.entities.filter((entity) => entity.alive && entity.type === 'human');
    expect(humans.length).toBeGreaterThanOrEqual(2);
    if (humans.length < 2) return;
    const [a, b] = humans;
    expect(requestDialogue({
      eventKey: 'neighbor.greeting', speaker: a, partner: b, tick: world.tick,
    })).toBe(true);
    const payload = buildSaveData(world, createInitialView(world.width, world.height));
    const restored = loadGameFromParsedOutcome(JSON.parse(JSON.stringify(payload)) as Record<string, unknown>);
    expect(restored.ok).toBe(true);
    if (!restored.ok) return;
    resetDialogueSessions();
    const restoredA = restored.world.entities.find((entity) => entity.id === a.id);
    const restoredB = restored.world.entities.find((entity) => entity.id === b.id);
    expect(restoredA).toBeDefined();
    expect(restoredB).toBeDefined();
    if (!restoredA || !restoredB) return;
    const resolve = (id: number) => id === restoredA.id ? restoredA : id === restoredB.id ? restoredB : undefined;
    tickHumanChat(restoredA, resolve);
    tickHumanChat(restoredB, resolve);
    expect(restoredA.chatDialogueSessionKey).toBeUndefined();
    expect(restoredB.chatDialogueSessionKey).toBeUndefined();
    expect(isDialogueBusy(restoredA)).toBe(false);
    expect(isDialogueBusy(restoredB)).toBe(false);
  });

});
