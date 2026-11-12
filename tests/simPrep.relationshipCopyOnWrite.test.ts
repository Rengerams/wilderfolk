/**
 * The rollback snapshot shares each entity's `friendships` / `feuds` / `feudPeaks` records rather
 * than cloning them, which is sound only while every writer uses copy-on-write. Dialogue history is
 * written in place, so it is copied instead.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { gameTick, initGame } from '../src/game/gameEngine';
import { EntityType, MapSize } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { extractSimPrep, applySimPrep } from '../src/game/simWorker/simPrep';
import {
  advanceSocialRelationships,
  hurtFriendship,
  reconcileCloseFriendships,
  startFeud,
} from '../src/game/relationships';
import { playerHumansFrom } from '../src/game/playerHuman';
import { createEntity } from '../src/game/worldGen';
import {
  canonicalDialogueBank,
  installDialogueBankPayload,
  requestDialogue,
  type DialogueBankFile,
} from '../src/game/dialogueTrees';
import { resetDialogueSessions } from '../src/game/humanChat';

type SnapshotRecords = Array<{ id: number; friendships: string; feuds: string; feudPeaks: string }>;

function records(entities: readonly Entity[]): SnapshotRecords {
  return entities.map((entity) => ({
    id: entity.id,
    friendships: JSON.stringify(entity.friendships ?? null),
    feuds: JSON.stringify(entity.feuds ?? null),
    feudPeaks: JSON.stringify(entity.feudPeaks ?? null),
  }));
}

function seedRelationships(world: WorldState): Entity[] {
  const people = playerHumansFrom(world.entities).slice(0, 3);
  while (people.length < 3) {
    const id = world.nextEntityId ?? world.entities.length;
    const person = createEntity(EntityType.Human, world.width / 2 + people.length * 12, world.height / 2, id, 250);
    world.entities.push(person);
    world.nextEntityId = id + 1;
    people.push(person);
  }
  startFeud(world, people[0], people[1], 40);
  hurtFriendship(people[0], people[2], 10);
  advanceSocialRelationships(world, world.entities);
  return people;
}

describe('rollback relationships are copy-on-write', () => {
  it('keeps the snapshot records pristine through every social mutator', () => {
    const world = initGame({ size: MapSize.Medium, seed: 777 });
    const people = seedRelationships(world);
    const prep = extractSimPrep(world);
    const before = records(prep.entities);

    startFeud(world, people[1], people[2], 30);
    hurtFriendship(people[1], people[0], 5);
    advanceSocialRelationships(world, world.entities);
    reconcileCloseFriendships(playerHumansFrom(world.entities));

    expect(records(prep.entities), 'a writer mutated the snapshot record in place').toEqual(before);

    applySimPrep(world, prep);
    expect(records(world.entities)).toEqual(before);
  });

  it('keeps the snapshot records pristine across a real day of social ticks', () => {
    const world = initGame({ size: MapSize.Medium, seed: 778 });
    seedRelationships(world);
    const prep = extractSimPrep(world);
    const before = records(prep.entities);

    for (let i = 0; i < 288; i++) gameTick(world);

    expect(records(prep.entities), 'a tick mutated the snapshot record in place').toEqual(before);
  });
});

/** Two solo scenes, so the second request advances instead of repeating the first. */
const twoSceneBank: DialogueBankFile = {
  version: '1.3',
  categories: ['dialogue'],
  dialogue_trees: [
    {
      id: 'scene_a',
      category: 'dialogue',
      eventKey: 'marriage.accepted',
      mode: 'solo',
      speakers: ['newlywed'],
      lines: [{ speaker: 'newlywed', text: 'We did it.' }],
    },
    {
      id: 'scene_b',
      category: 'dialogue',
      eventKey: 'marriage.accepted',
      mode: 'solo',
      speakers: ['newlywed'],
      lines: [{ speaker: 'newlywed', text: 'We said yes.' }],
    },
  ],
};

/** Ends the visible chat the way the realtime keeper does, leaving the per-entity history intact. */
function endChat(speaker: Entity): void {
  speaker.chatPhrase = undefined;
  speaker.chatTicks = undefined;
  speaker.chatDialogueSessionKey = undefined;
  speaker.chatPartnerId = undefined;
  resetDialogueSessions();
}

afterEach(() => {
  resetDialogueSessions();
  installDialogueBankPayload(canonicalDialogueBank);
});

describe('rollback dialogue history is copied', () => {
  it('does not let a cooldown from a rolled-back tick suppress the line', () => {
    installDialogueBankPayload(twoSceneBank);
    resetDialogueSessions();
    const world = initGame({ size: MapSize.Medium, seed: 779 });
    const speaker = playerHumansFrom(world.entities)[0];
    const tick = 1000;
    const request = (who: Entity) => requestDialogue({
      eventKey: 'marriage.accepted', speaker: who, tick, selectionRoll: 0,
    });

    // The settler already carries a scene history before the tick under rollback.
    expect(request(speaker)).toBe(true);
    expect(speaker.dialogueRecentScenes?.['marriage.accepted:solo']).toMatchObject({ id: 'scene_a' });
    endChat(speaker);

    const prep = extractSimPrep(world);
    const snapshot = prep.entities.find((entity) => entity.id === speaker.id)!;
    const snapshotScenes = JSON.stringify(snapshot.dialogueRecentScenes);
    const snapshotLines = JSON.stringify(snapshot.dialogueRecentLines);

    // This is the line the player never sees: its tick rolls back.
    expect(request(speaker)).toBe(true);
    expect(speaker.dialogueRecentScenes?.['marriage.accepted:solo']).toMatchObject({ id: 'scene_b' });
    expect(JSON.stringify(snapshot.dialogueRecentScenes), 'a writer mutated the snapshot in place')
      .toBe(snapshotScenes);
    expect(JSON.stringify(snapshot.dialogueRecentLines)).toBe(snapshotLines);

    endChat(speaker);
    applySimPrep(world, prep);
    const restored = world.entities.find((entity) => entity.id === speaker.id)!;
    // The rolled-back scene cooldown is gone, so the same line can still play for the player.
    expect(request(restored)).toBe(true);
    expect(restored.chatPhrase).toBe('We said yes.');
  });
});
