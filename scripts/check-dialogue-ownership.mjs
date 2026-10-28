#!/usr/bin/env node
/**
 * Dialogue migration ratchet. Run by scripts/test.mjs's existing check gate.
 *
 * Domain modules decide when speaking is eligible; dialogueTrees.ts selects
 * imported JSON; humanChat.ts alone writes simulated entity chat fields.
 * The render buffer is a transport mirror, never a second speech initiator.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const errors = [];
const resolve = (...parts) => path.join(ROOT, ...parts);
const slash = (p) => path.relative(ROOT, p).replaceAll('\\', '/');
const speechFields = new Set(['chatPhrase', 'chatTicks', 'chatPartnerId', 'chatDialogueSessionKey']);
const allowedChatFieldMutation = new Set([
  'src/game/humanChat.ts',
  'src/game/simBuffers/applyKinematics.ts', // worker-to-render mirror, not speech
]);

function walk(directory, suffixes) {
  if (!existsSync(directory)) return [];
  const found = [];
  for (const entry of readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full, suffixes));
    else if (suffixes.some((ext) => full.endsWith(ext))) found.push(full);
  }
  return found;
}

const sourceFiles = walk(resolve('src'), ['.ts', '.tsx']);
const rootDialoguePath = 'src/game/dialogueTrees.ts';
const dialogueFiles = new Set();
for (const file of sourceFiles) {
  const name = slash(file);
  const original = readFileSync(file, 'utf8');
  // Lightweight source-level ratchet. Unlike compiler AST APIs this works
  // with the project's installed native TypeScript 7 CLI package.
  const code = original.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  if (name === rootDialoguePath) {
    for (const match of original.matchAll(/from\s+['"](\.\/data\/[^'"]+\.json)['"]/g)) {
      const target = path.posix.normalize(path.posix.join('src/game', match[1]));
      dialogueFiles.add(target);
    }
  }
  if (name !== rootDialoguePath && /from\s+['"][^'"]*humanChat['"]/.test(original)) {
    const importSections = [...original.matchAll(/import\s*\{([^}]+)\}\s*from\s+['"][^'"]*humanChat['"]/g)];
    if (importSections.some((m) => /\b(?:startDialogueTreeChat|prepareScriptedDialogue)\b/.test(m[1]))) {
      errors.push(`${name}: mutable chat-session internals imported outside dialogueTrees.ts`);
    }
  }
  if (name === rootDialoguePath && /\\b(?:pickDialogueTree|resolveDialogueCategories)\\s*\\(/.test(code)) {
    errors.push(`${name}: forbidden category-wide dialogue picker survived event-key migration`);
  }
  if (/\bsayHumanChatPhrase\s*\(/.test(code)) {
    errors.push(`${name}: legacy direct speech call`);
  }
  if (!allowedChatFieldMutation.has(name)) {
    for (const match of code.matchAll(/\.\s*(chatPhrase|chatTicks|chatPartnerId|chatDialogueSessionKey)\s*(?:=(?!=)|\+\+|--|\+=|-=)/g)) {
      errors.push(`${name}: unauthorized ${match[1]} write`);
    }
  }
  if (name === 'src/game/socialLife.ts' && /\b(?:bubble|chatPhrase)\s*:/.test(code)) {
    errors.push(`${name}: social motive owns prose instead of an event key`);
  }
}

const dataFiles = walk(resolve('src/game/data'), ['.json']);
const seenTrees = new Map();
let activeScenes = 0;
for (const filename of dataFiles) {
  const rel = slash(filename);
  // Elections.json contains conflicting historic text under ten IDs already
  // supplied by needs.json: keep it quarantined until intentionally resolved.
  if (rel === 'src/game/data/Elections.json') continue;
  let value;
  try { value = JSON.parse(readFileSync(filename, 'utf8')); }
  catch (e) { errors.push(`${rel}: malformed JSON (${e.message})`); continue; }
  if (!value || !('dialogue_trees' in value)) continue;
  if (value.version !== '1.3' || value.game !== 'Wilderfolk Sim'
    || !value.category || !Array.isArray(value.categories)
    || value.categories.length !== 1 || value.categories[0] !== value.category
    || !Array.isArray(value.dialogue_trees)) {
    errors.push(`${rel}: invalid dialogue schema 1.3 header`);
    continue;
  }
  const isPresentation = rel.endsWith('/spotlight-lore.json');
  if (!isPresentation && !dialogueFiles.has(rel)) {
    errors.push(`${rel}: dialogue source is not imported by the canonical bank`);
  }
  if (isPresentation && dialogueFiles.has(rel)) {
    errors.push(`${rel}: paused group presentation cannot enter the ambient bank`);
  }
  for (const tree of value.dialogue_trees) {
    if (!tree || typeof tree.id !== 'string' || !tree.id.trim()) {
      errors.push(`${rel}: missing tree ID`); continue;
    }
    if (seenTrees.has(tree.id)) errors.push(`${rel}: duplicate tree ID ${tree.id} (already ${seenTrees.get(tree.id)})`);
    seenTrees.set(tree.id, rel);
    const expectedType = tree.conversation_type === 'group' ? 'group'
      : tree.speakers?.length === 1 ? 'one_way'
        : tree.speakers?.length === 2 ? 'two_way' : null;
    if (tree.category !== value.category || !tree.eventKey?.trim()
      || tree.conversation_type !== expectedType
      || (!isPresentation && tree.conversation_type === 'group')
      || !Array.isArray(tree.speakers) || !tree.speakers.length
      || new Set(tree.speakers).size !== tree.speakers.length
      || !tree.speakers.every((role) => typeof role === 'string' && role.trim())
      || !Array.isArray(tree.lines) || !tree.lines.length
      || tree.lines.some((line) => typeof line.text !== 'string' || !line.text.trim()
        || !tree.speakers.includes(line.speaker))) {
      errors.push(`${rel}: invalid role, event or line in ${tree.id}`);
    }
    activeScenes++;
  }
}
// Historical Elections.json is not an election source: all ten IDs overlap
// needs.json, but their original authored text/metadata differs and is retained.
try {
  const legacy = JSON.parse(readFileSync(resolve('src/game/data/Elections.json'), 'utf8'));
  const needs = JSON.parse(readFileSync(resolve('src/game/data/needs.json'), 'utf8'));
  const primary = new Map(needs.dialogue_trees.map((scene) => [scene.id, scene]));
  const ids = new Set();
  if (legacy.dialogue_trees.length !== 10) errors.push('Elections.json: expected ten quarantined historical scenes');
  for (const scene of legacy.dialogue_trees) {
    if (ids.has(scene.id) || !primary.has(scene.id)
      || JSON.stringify(scene) === JSON.stringify(primary.get(scene.id))
      || scene.category !== 'needs') {
      errors.push(`Elections.json: invalid historical duplicate ${scene.id}`);
    }
    ids.add(scene.id);
  }
} catch (e) {
  errors.push(`Elections.json: legacy duplication reconciliation failed (${e.message})`);
}
for (const file of dialogueFiles) {
  if (!existsSync(resolve(file))) errors.push(`${rootDialoguePath}: imported missing JSON source ${file}`);
}
if (activeScenes < 150) errors.push(`Dialogue catalog unexpectedly small: ${activeScenes} active scenes`);

if (errors.length) {
  console.error(`Dialogue ownership/schema failed (${errors.length}):\n${errors.map((e) => '- ' + e).join('\n')}`);
  process.exitCode = 1;
} else {
  console.log(`Dialogue ownership/schema OK: ${activeScenes} authored scenes; one simulated field writer, no orphaned active JSON or legacy speech calls.`);
}
