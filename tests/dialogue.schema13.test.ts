import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bindNumberedPresentationSpeakers,
  canonicalDialogueBank,
  DIALOGUE_SCHEMA_VERSION,
  readPresentationDialogue,
} from '../src/game/dialogueTrees';

type JsonScene = {
  id: string;
  category: string;
  eventKey?: string;
  conversation_type?: string;
  mode?: string;
  speakers: string[];
  lines: Array<{ speaker: string; text: string }>;
};

type JsonSource = {
  version: string;
  game: string;
  category: string;
  categories: string[];
  dialogue_trees: JsonScene[];
};

const dataDirectory = new URL('../src/game/data/', import.meta.url);

function readSources(relative = ''): Array<{ path: string; source: JsonSource }> {
  const current = new URL(relative === '' ? './' : relative + '/', dataDirectory);
  const files: Array<{ path: string; source: JsonSource }> = [];
  for (const entry of readdirSync(current, { withFileTypes: true })) {
    const path = relative ? join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) {
      files.push(...readSources(path));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push({
        path,
        source: JSON.parse(readFileSync(new URL(path.replaceAll('\\', '/'), dataDirectory), 'utf8')) as JsonSource,
      });
    }
  }
  return files;
}

describe('v1.3 dialogue source contract', () => {
  it('normalizes every source and retains explicit one-way/two-way speaker roles', () => {
    const files = readSources();
    expect(files.length).toBeGreaterThanOrEqual(29);

    for (const { path, source } of files) {
      expect(source.version, path).toBe(DIALOGUE_SCHEMA_VERSION);
      expect(source.game, path).toBe('Wilderfolk Sim');
      expect(source.categories, path).toEqual([source.category]);

      for (const tree of source.dialogue_trees) {
        expect(tree.category, tree.id).toBe(source.category);
        if (tree.conversation_type === 'group') {
          expect(tree.eventKey?.trim(), tree.id).toBeTruthy();
          expect(() => readPresentationDialogue(source, tree.eventKey!), tree.id).not.toThrow();
        } else {
          expect(tree.conversation_type, tree.id).toBe(
            tree.speakers.length === 1 ? 'one_way' : 'two_way',
          );
        }
        expect(tree.mode, tree.id).toBeUndefined();
        expect(tree.lines.length, tree.id).toBeGreaterThan(0);
        expect(new Set(tree.speakers).size, tree.id).toBe(tree.speakers.length);
        for (const line of tree.lines) {
          expect(tree.speakers, tree.id).toContain(line.speaker);
          expect(line.text.trim(), tree.id).not.toBe('');
        }
        if (path !== 'Elections.json') expect(tree.eventKey?.trim(), tree.id).toBeTruthy();
      }
    }
  });

  it('compiles one unique runtime bank and keeps the legacy Elections duplicate inactive', () => {
    const files = readSources();
    const active = files.filter(({ path }) => path !== 'Elections.json');
    // Paused group-caption scenes are intentionally outside the ambient solo/pair bank.
    const sourceIds = active.flatMap(({ source }) =>
      source.dialogue_trees.filter((tree) => tree.conversation_type !== 'group').map((tree) => tree.id));
    const compiledIds = canonicalDialogueBank.dialogue_trees.map((tree) => tree.id);

    expect(canonicalDialogueBank.version).toBe('1.3');
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
    expect(new Set(compiledIds).size).toBe(compiledIds.length);
    expect(new Set(compiledIds)).toEqual(new Set(sourceIds));

    for (const tree of canonicalDialogueBank.dialogue_trees) {
      expect(tree.mode).toBe(tree.speakers.length === 1 ? 'solo' : 'pair');
    }
  });
});

describe('PR #91 group-caption JSON compatibility', () => {
  const groupSource = {
    version: '1.3',
    game: 'Wilderfolk Sim',
    category: 'spotlight',
    categories: ['spotlight'],
    dialogue_trees: [{
      id: 'spotlight_example',
      category: 'spotlight',
      eventKey: 'spotlight.theLook',
      conversation_type: 'group',
      speakers: ['chorus', 'heroine', 'narrator'],
      lines: [
        { speaker: 'chorus', text: 'Welcome to the village!', durationMs: 3200 },
        { speaker: 'narrator', text: 'An awkward pause.' },
        { speaker: 'heroine', text: 'Is everyone looking at me?' },
      ],
    }],
  } as const;

  it('returns ordered lines, role tags, and optional real-time caption timings', () => {
    const scene = readPresentationDialogue(groupSource, 'spotlight.theLook');
    expect(scene.id).toBe('spotlight_example');
    expect(scene.speakers).toEqual(['chorus', 'heroine', 'narrator']);
    expect(scene.lines.map(({ speaker }) => speaker)).toEqual(['chorus', 'narrator', 'heroine']);
    expect(scene.lines[0]).toEqual({ speaker: 'chorus', text: 'Welcome to the village!', durationMs: 3200 });
    expect(scene.lines[1]?.durationMs).toBeUndefined();
    expect(Object.isFrozen(scene)).toBe(true);
    expect(Object.isFrozen(scene.lines)).toBe(true);
  });

  it('binds exactly the numbered roles to real performer IDs, leaving extra gathered villagers silent', () => {
    const roles = Array.from({ length: 6 }, (_, i) => `speaker_${i + 1}`);
    const source = {
      version: '1.3',
      game: 'Wilderfolk Sim',
      category: 'festival',
      categories: ['festival'],
      dialogue_trees: [{
        id: 'spotlight.lore.performance',
        category: 'festival',
        eventKey: 'spotlight.lore',
        conversation_type: 'group',
        speakers: roles,
        lines: Array.from({ length: 31 }, (_, i) => ({
          speaker: roles[i % roles.length],
          text: `Line ${i + 1}`,
        })),
      }],
    };
    const presentation = readPresentationDialogue(source, 'spotlight.lore');
    const performers = [102, 107, 109, 114, 120, 123, 130, 135];
    const bound = bindNumberedPresentationSpeakers(presentation, performers);
    expect(bound).toHaveLength(31);
    expect(bound.map((line) => line.speakerId)).toEqual(
      Array.from({ length: 31 }, (_, i) => performers[i % 6]),
    );
    expect(bound.map((line) => line.text)).toEqual(
      Array.from({ length: 31 }, (_, i) => `Line ${i + 1}`),
    );
    expect(new Set(bound.map((line) => line.speakerId)).size).toBe(6);
    expect(bound.some((line) => line.speakerId === 130 || line.speakerId === 135)).toBe(false);
    expect(Object.isFrozen(bound)).toBe(true);
    expect(performers).toHaveLength(8);

    expect(() => bindNumberedPresentationSpeakers(presentation, performers.slice(0, 5)))
      .toThrow(/6–10 real performers/);
    expect(() => bindNumberedPresentationSpeakers(presentation, [...performers, 141, 142, 143]))
      .toThrow(/6–10 real performers/);
    expect(() => bindNumberedPresentationSpeakers(presentation, [...performers, 130]))
      .toThrow(/Invalid or duplicate/);
    expect(() => bindNumberedPresentationSpeakers(presentation, [102, 107, 109, 114, 120, 102]))
      .toThrow(/Invalid or duplicate/);
    expect(() => bindNumberedPresentationSpeakers(presentation, [102, 107, 109, 114, 120, -1]))
      .toThrow(/Invalid or duplicate/);
    const nonNumbered = readPresentationDialogue(groupSource, 'spotlight.theLook');
    expect(() => bindNumberedPresentationSpeakers(nonNumbered, performers))
      .toThrow(/must be sequential/);
  });

  it('accepts every gathering size from six through ten without inventing extra actors', () => {
    const roles = Array.from({ length: 6 }, (_, i) => `speaker_${i + 1}`);
    const source = {
      version: '1.3',
      game: 'Wilderfolk Sim',
      category: 'festival',
      categories: ['festival'],
      dialogue_trees: [{
        id: 'spotlight.lore.performance',
        category: 'festival',
        eventKey: 'spotlight.lore',
        conversation_type: 'group',
        speakers: roles,
        lines: roles.map((speaker, i) => ({ speaker, text: `Line ${i + 1}` })),
      }],
    };
    const scene = readPresentationDialogue(source, 'spotlight.lore');
    const actors = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110];
    for (let size = 6; size <= 10; size++) {
      const cast = Object.freeze(actors.slice(0, size));
      const bound = bindNumberedPresentationSpeakers(scene, cast);
      expect(bound.map((line) => line.speakerId), `cast size ${size}`).toEqual(actors.slice(0, 6));
      expect(bound.every((line) => cast.includes(line.speakerId))).toBe(true);
      expect(Object.isFrozen(bound)).toBe(true);
    }
  });

  it('reuses real adults deterministically when a script declares more roles than the cast', () => {
    const roles = Array.from({ length: 10 }, (_, i) => `speaker_${i + 1}`);
    const source = {
      version: '1.3',
      game: 'Wilderfolk Sim',
      category: 'festival',
      categories: ['festival'],
      dialogue_trees: [{
        id: 'group.overflow',
        category: 'festival',
        eventKey: 'group.overflow',
        conversation_type: 'group',
        speakers: roles,
        lines: roles.map((speaker, i) => ({ speaker, text: `Role ${i + 1}` })),
      }],
    };
    const presentation = readPresentationDialogue(source, 'group.overflow');
    const cast = Object.freeze([201, 202, 203, 204, 205, 206]);
    const bound = bindNumberedPresentationSpeakers(presentation, cast);
    expect(bound.map((line) => line.speakerId))
      .toEqual([201, 202, 203, 204, 205, 206, 201, 202, 203, 204]);
    expect(bound.map((line) => line.speaker)).toEqual(roles);
    expect(bound.map((line) => line.text)).toEqual(roles.map((_, i) => `Role ${i + 1}`));
    expect(bindNumberedPresentationSpeakers(presentation, cast)).toEqual(bound);
    expect(cast).toEqual([201, 202, 203, 204, 205, 206]);
  });

  it('does not write to human chat state or create a new gameplay chat session', () => {
    const speaker = { id: 491, chatPhrase: 'Still talking', chatTicks: 8 };
    const before = { ...speaker };
    readPresentationDialogue(groupSource, 'spotlight.theLook');
    expect(speaker).toEqual(before);
  });

  it('rejects missing, duplicate or malformed group events instead of reusing ambient lines', () => {
    expect(() => readPresentationDialogue(groupSource, 'spotlight.missing')).toThrow(/Missing presentation event key/);
    expect(() => readPresentationDialogue({ ...groupSource, version: '1.2' }, 'spotlight.theLook')).toThrow(/Invalid 1.3/);
    expect(() => readPresentationDialogue({
      ...groupSource,
      dialogue_trees: [groupSource.dialogue_trees[0], groupSource.dialogue_trees[0]],
    }, 'spotlight.theLook')).toThrow(/duplicate presentation tree ID/);
    expect(() => readPresentationDialogue({
      ...groupSource,
      dialogue_trees: [{
        ...groupSource.dialogue_trees[0],
        lines: [{ speaker: 'stranger', text: 'Wrong voice.' }],
      }],
    }, 'spotlight.theLook')).toThrow(/Invalid presentation tree/);
    expect(() => readPresentationDialogue({
      ...groupSource,
      dialogue_trees: [{
        ...groupSource.dialogue_trees[0],
        lines: [{ speaker: 'chorus', text: 'Too fast', durationMs: 0 }],
      }],
    }, 'spotlight.theLook')).toThrow(/Invalid presentation tree/);
  });
});
