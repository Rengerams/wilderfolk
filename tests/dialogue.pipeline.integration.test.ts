import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { personDayRoll } from '../src/game/simRng';
import { getHourOfDay, TICKS_PER_DAY, TICKS_PER_HOUR } from '../src/game/dayCycle';
import { DEFAULT_WORK_SCHEDULE, isWorkScheduleHour } from '../src/game/workSchedule';
import { BuildingType, EntityType, JobType, type Building } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';
import { resolveCivicPetition } from '../src/game/townHall';
import { initGame } from '../src/game/worldGen';
import { requestDialogue, canonicalDialogueBank } from '../src/game/dialogueTrees';
import { formatChatLine, resetDialogueSessions, tickHumanChat, type ChatSpeaker } from '../src/game/humanChat';
import { buildSaveData, loadGameFromParsedOutcome } from '../src/game/saveLoad';
import { createInitialView } from '../src/game/viewState';

beforeEach(resetDialogueSessions);
afterEach(resetDialogueSessions);

function adults(world: ReturnType<typeof initGame>) {
  return world.entities.filter((entity) =>
    entity.type === EntityType.Human && entity.alive && !entity.isJuvenile && isPlayerHuman(entity));
}

function runSoloLine(speaker: ChatSpeaker): void {
  for (let guard = 0; guard < 200 && speaker.chatDialogueSessionKey; guard++) {
    tickHumanChat(speaker);
  }
}

describe('chat pipeline — trigger, session, line memory', () => {
  it('runs a real civic food petition through the full line and records the speaker line', () => {
    const world = initGame({ seed: 83721 });
    const humans = adults(world);
    expect(humans.length).toBeGreaterThanOrEqual(2);
    if (humans.length < 2) return;
    const [petitioner, official] = humans;
    const hall = {
      id: 98711, type: BuildingType.TownHall, x: 80, y: 80, width: 40, height: 30,
      occupants: [official.id], completed: true,
    } as Building;
    world.buildings.push(hall);
    official.job = JobType.Official;
    official.workerBuildingId = hall.id;
    petitioner.x = 100;
    petitioner.y = 107;
    expect(petitioner.needs).toBeDefined();
    if (!petitioner.needs) return;
    petitioner.needs.nutrition = 0;
    world.humanPopulation = Math.max(world.humanPopulation, 5);
    world.resources.food = 8;
    const tick = Array.from({ length: 5000 }, (_, i) => i + 1).find((candidate) => {
      const day = Math.floor(candidate / TICKS_PER_DAY);
      return isWorkScheduleHour(DEFAULT_WORK_SCHEDULE, getHourOfDay(candidate))
        && personDayRoll(petitioner.id, candidate, 821 + day) <= 0.4
        && personDayRoll(petitioner.id, candidate, 822) < 0.45;
    });
    expect(tick).toBeDefined();
    if (tick === undefined) return;
    world.tick = tick;

    expect(resolveCivicPetition(world, petitioner, hall)).toMatchObject({ kind: 'aid_food' });
    expect(petitioner.chatDialogueSessionKey).toBe(`solo:${petitioner.id}`);
    expect(petitioner.chatPhrase).toMatch(/bread|grain/i);
    const firstLine = petitioner.chatPhrase;
    expect(petitioner.dialogueRecentLines).toBeDefined();
    expect(Object.keys(petitioner.dialogueRecentLines!).length).toBeGreaterThan(0);

    runSoloLine(petitioner);
    expect(petitioner.chatDialogueSessionKey).toBeUndefined();

    // Same settler: the line they just said is filtered, so the request must move to the other authored scene.
    resetDialogueSessions();
    expect(requestDialogue({
      eventKey: 'townHall.foodAid', speaker: petitioner, tick: tick + 1, selectionRoll: 0,
    })).toBe(true);
    expect(petitioner.chatPhrase).not.toBe(firstLine);

    // A different settler may use that same circumstance, but only with their own line memory.
    const other = humans[2] ?? humans[1];
    resetDialogueSessions();
    expect(requestDialogue({
      eventKey: 'townHall.foodAid', speaker: other, tick: tick + 2, selectionRoll: 0,
    })).toBe(true);
    expect(other.chatPhrase).toMatch(/bread|grain/i);
  });

  it('runs a real two-settler conversation, releases both, and persists both line histories', () => {
    const world = initGame({ seed: 84111 });
    const humans = adults(world);
    expect(humans.length).toBeGreaterThanOrEqual(2);
    if (humans.length < 2) return;
    const [a, b] = humans;
    world.tick = 1000;
    expect(requestDialogue({
      eventKey: 'neighbor.greeting', speaker: a, partner: b, tick: world.tick,
      selectionRoll: 0, durationHours: 4 / TICKS_PER_HOUR,
    })).toBe(true);
    expect(a.chatDialogueSessionKey).toBeDefined();
    expect(b.chatDialogueSessionKey).toBe(a.chatDialogueSessionKey);
    const chosenId = a.dialogueRecentScenes?.['neighbor.greeting:pair']?.id;
    const chosen = canonicalDialogueBank.dialogue_trees.find((tree) => tree.id === chosenId);
    expect(chosen).toBeDefined();
    if (!chosen) return;
    const resolve = (id: number) => id === a.id ? a : id === b.id ? b : undefined;
    const observed = new Set<string>();
    for (let guard = 0; guard < 200 && a.chatDialogueSessionKey; guard++) {
      if (a.chatPhrase) observed.add(a.chatPhrase);
      if (b.chatPhrase) observed.add(b.chatPhrase);
      tickHumanChat(a, resolve);
      if (a.chatDialogueSessionKey) tickHumanChat(b, resolve);
    }
    expect(a.chatDialogueSessionKey).toBeUndefined();
    expect(b.chatDialogueSessionKey).toBeUndefined();
    for (const line of chosen.lines) {
      const who = line.speaker === chosen.speakers[0] ? a : b;
      expect(observed).toContain(formatChatLine(line.text, who));
    }
    expect(a.dialogueRecentLines).toBeDefined();
    expect(b.dialogueRecentLines).toBeDefined();
    const firstA = { ...a.dialogueRecentLines };
    const firstB = { ...b.dialogueRecentLines };

    const payload = buildSaveData(world, createInitialView(world.width, world.height));
    const loaded = loadGameFromParsedOutcome(JSON.parse(JSON.stringify(payload)) as Record<string, unknown>);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const savedA = loaded.world.entities.find((entity) => entity.id === a.id);
    const savedB = loaded.world.entities.find((entity) => entity.id === b.id);
    expect(savedA?.dialogueRecentLines).toEqual(firstA);
    expect(savedB?.dialogueRecentLines).toEqual(firstB);
  });

  it('keeps solo and pair routes separate: solo one settler, pair needs a partner', () => {
    const world = initGame({ seed: 84112 });
    const humans = adults(world);
    expect(humans.length).toBeGreaterThanOrEqual(2);
    if (humans.length < 2) return;
    const [a, b] = humans;

    expect(requestDialogue({ eventKey: 'neighbor.greeting', speaker: a, tick: 50 })).toBe(false);
    expect(requestDialogue({ eventKey: 'marriage.accepted', speaker: a, tick: 50 })).toBe(true);
    expect(a.chatPartnerId).toBeUndefined();
    expect(a.chatDialogueSessionKey).toBe(`solo:${a.id}`);
    runSoloLine(a);
    resetDialogueSessions();

    // A solo-authored event has no pair pool, so a partner does not turn it into a conversation.
    expect(requestDialogue({ eventKey: 'marriage.accepted', speaker: b, partner: a, tick: 51 })).toBe(false);
    expect(b.chatPartnerId).toBeUndefined();
    expect(b.chatDialogueSessionKey).toBeUndefined();
  });
});
