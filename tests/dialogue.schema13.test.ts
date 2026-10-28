import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalDialogueBank,
  DIALOGUE_SCHEMA_VERSION,
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
        expect(tree.conversation_type, tree.id).toBe(
          tree.speakers.length === 1 ? 'one_way' : 'two_way',
        );
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
    const sourceIds = active.flatMap(({ source }) => source.dialogue_trees.map((tree) => tree.id));
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
