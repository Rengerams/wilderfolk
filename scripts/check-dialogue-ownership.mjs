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
import ts from 'typescript';

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
  const source = ts.createSourceFile(name, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true,
    name.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function scan(node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const imported = node.moduleSpecifier.text;
      if (name === rootDialoguePath && imported.endsWith('.json')) {
        const target = path.posix.normalize(path.posix.join('src/game', imported));
        dialogueFiles.add(target);
      }
      if (imported.endsWith('humanChat') && name !== rootDialoguePath) {
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings) && bindings.elements.some(
          (entry) => ['startDialogueTreeChat', 'prepareScriptedDialogue'].includes(entry.propertyName?.text ?? entry.name.text),
        )) errors.push(`${name}: mutable chat-session internals imported outside dialogueTrees.ts`);
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)
      && node.expression.text === 'sayHumanChatPhrase') {
      errors.push(`${name}: legacy direct speech call`);
    }
    if (ts.isBinaryExpression(node) && ts.isPropertyAccessExpression(node.left)
      && speechFields.has(node.left.name.text)
      && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment
      && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
      && !allowedChatFieldMutation.has(name)) {
      errors.push(`${name}: unauthorized ${node.left.name.text} write`);
    }
    if (name === 'src/game/socialLife.ts' && ts.isPropertyAssignment(node)
      && (node.name.getText(source) === 'bubble' || node.name.getText(source) === 'chatPhrase')) {
      errors.push(`${name}: social motive owns prose instead of an event key`);
    }
    ts.forEachChild(node, scan);
  }
  scan(source);
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
