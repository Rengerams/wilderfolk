import { personDayRoll, getHourOfDay, isWorkHour, TICKS_PER_DAY } from '../src/game/dayCycle';
import { BuildingType, EntityType, JobType, type Building } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';
import { treatPatientAtHospital } from '../src/game/hospitalCare';
import { resolveCivicPetition } from '../src/game/townHall';
import { initGame } from '../src/game/worldGen';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { canonicalDialogueBank, requestDialogue } from '../src/game/dialogueTrees';
import { resetDialogueSessions, type ChatSpeaker } from '../src/game/humanChat';

beforeEach(resetDialogueSessions);
afterEach(resetDialogueSessions);

describe('domain event-to-caption integration', () => {
  it('keeps hospital, lodging, civic, marriage, hunting and omen captions in their original outcome branch', () => {
    const cases = [
      'hospital.patient.pregnant', 'hospital.patient.other', 'hospital.doctor',
      'hotel.arrival', 'hotel.service.busy', 'hotel.service.welcome',
      'townHall.foodAid', 'townHall.goldAid', 'townHall.heard', 'townHall.generic',
      'townHall.audience.petitioner', 'townHall.audience.leader', 'townHall.official',
      'marriage.accepted', 'hunting.scarce', 'hunting.thinTrails', 'renffr.omen',
      'election.buildup', 'election.ceremony', 'election.tension', 'election.winner',
    ] as const;
    for (const [i, eventKey] of cases.entries()) {
      const tree = canonicalDialogueBank.dialogue_trees.find((scene) =>
        scene.eventKey === eventKey && scene.mode === 'solo');
      expect(tree, eventKey).toBeDefined();
      if (!tree) continue;
      const speaker: ChatSpeaker & { energy: number; gold: number } = { id: 9000 + i, name: 'Speaker', energy: 63, gold: 17 };
      const before = { energy: speaker.energy, gold: speaker.gold };
      expect(requestDialogue({
        eventKey, treeId: tree.id, speaker, tick: 100 + i,
        variables: { leader: 'Mara', candidateA: 'Theo', candidateB: 'Ada', candidateC: 'Luz' },
      }), eventKey).toBe(true);
      expect(speaker.energy, eventKey).toBe(before.energy);
      expect(speaker.gold, eventKey).toBe(before.gold);
      expect(speaker.chatPartnerId, eventKey).toBeUndefined();
      expect(speaker.chatDialogueSessionKey, eventKey).toBe('solo:' + speaker.id);
    }
  });

  it('rejects text from a different outcome instead of inventing aid or pregnancy results', () => {
    const patient: ChatSpeaker = { id: 9701 };
    expect(requestDialogue({
      eventKey: 'hospital.patient.other', treeId: 'evt_hospital_patient_pregnant_0',
      speaker: patient, tick: 1,
    })).toBe(false);
    expect(requestDialogue({
      eventKey: 'townHall.foodAid', treeId: 'evt_townHall_goldAid_0',
      speaker: patient, tick: 1,
    })).toBe(false);
    expect(requestDialogue({ eventKey: 'pregnancy.daily', speaker: patient, tick: 1,
      treeId: 'wf_pregnant_kicking' })).toBe(false);
    expect(patient.chatDialogueSessionKey).toBeUndefined();
    expect(patient.chatPhrase).toBeUndefined();
  });

  it('speaks a marriage acceptance once per real actor without creating a pair or a game outcome', () => {
    const a: ChatSpeaker = { id: 9911 };
    const b: ChatSpeaker = { id: 9912 };
    expect(requestDialogue({ eventKey: 'marriage.accepted', speaker: a, tick: 80,
      priority: 'scripted' })).toBe(true);
    expect(requestDialogue({ eventKey: 'marriage.accepted', speaker: b, tick: 80,
      priority: 'scripted' })).toBe(true);
    expect(a.chatPhrase).toContain('Yes!');
    expect(b.chatPhrase).toContain('Yes!');
    expect(a.chatDialogueSessionKey).not.toBe(b.chatDialogueSessionKey);
    expect(a.chatPartnerId).toBeUndefined();
    expect(b.chatPartnerId).toBeUndefined();
  });
  it('runs the real hospital treatment and emits only its selected patient outcome', () => {
    const world = initGame({ seed: 83721 });
    const patient = world.entities.find((entity) =>
      entity.type === EntityType.Human && entity.alive && !entity.isJuvenile && isPlayerHuman(entity));
    expect(patient).toBeDefined();
    if (!patient) return;
    const doctor = world.entities.find((entity) => entity.id !== patient.id && entity.alive && isPlayerHuman(entity));
    expect(doctor).toBeDefined();
    if (!doctor) return;
    patient.maxEnergy = 100;
    patient.energy = 30;
    patient.pregnant = true;
    const tick = Array.from({ length: 5000 }, (_, i) => i + 1)
      .find((candidate) => personDayRoll(patient.id, candidate, 904) < 0.2);
    expect(tick).toBeDefined();
    if (tick === undefined) return;
    world.tick = tick;
    const hospital = { id: 98710, occupants: [doctor.id] } as Building;
    expect(treatPatientAtHospital(world, patient, hospital, { doctorPresent: true })).toBe(true);
    expect(patient.energy).toBeGreaterThan(30);
    expect(patient.chatDialogueSessionKey).toBe(`solo:${patient.id}`);
    const correctLines = canonicalDialogueBank.dialogue_trees
      .filter((scene) => scene.eventKey === 'hospital.patient.pregnant')
      .flatMap((scene) => scene.lines.map((line) => line.text));
    expect(correctLines).toContain(patient.chatPhrase?.replaceAll('\n', ' '));
  });

  it('runs a real staffed civic food petition without substituting gold aid', () => {
    const world = initGame({ seed: 83722 });
    const humans = world.entities.filter((entity) =>
      entity.type === EntityType.Human && entity.alive && !entity.isJuvenile && isPlayerHuman(entity));
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
      return isWorkHour(getHourOfDay(candidate))
        && personDayRoll(petitioner.id, candidate, 821 + day) <= 0.4
        && personDayRoll(petitioner.id, candidate, 822) < 0.45;
    });
    expect(tick).toBeDefined();
    if (tick === undefined) return;
    world.tick = tick;
    const goldBefore = world.resources.gold;
    const result = resolveCivicPetition(world, petitioner, hall);
    expect(result.kind).toBe('aid_food');
    if (result.kind !== 'aid_food') return;
    expect(world.resources.food).toBe(8 - result.amount);
    expect(world.resources.gold).toBe(goldBefore);
    const expectedLines = canonicalDialogueBank.dialogue_trees
      .filter((scene) => scene.eventKey === 'townHall.foodAid')
      .flatMap((scene) => scene.lines.map((line) => line.text));
    expect(expectedLines).toContain(petitioner.chatPhrase?.replaceAll('\n', ' '));
  });

});
