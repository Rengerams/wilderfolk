#!/usr/bin/env node
/**
 * Migrate imports away from a re-export-only TypeScript compatibility facade.
 * Dry-run by default; --apply rewrites callers and removes the obsolete file.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_DIRS = ['src', 'tests', 'scripts', 'config'];
const CODE_EXTENSIONS = /\.(?:ts|tsx|mts|cts|js|mjs)$/;
const REEXPORT = /\bexport\s+(type\s+)?\{([^{}]+)\}\s+from\s+(['"])([^'"]+)\3\s*;?/g;
const FORWARD = /\b(import|export)\s+(type\s+)?\{([^{}]+)\}\s+from\s+(['"])([^'"]+)\4\s*;?/g;
const REFERENCE = /\b(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s*)(['"])([^'"]+)\1/g;

function sourceFiles(directory, result = []) {
  if (!existsSync(directory)) return result;
  for (const item of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) sourceFiles(file, result);
    else if (item.isFile() && CODE_EXTENSIONS.test(file)) result.push(file);
  }
  return result;
}

function splitNames(body) {
  return body.split(',').map((part) => part.trim()).filter(Boolean).map((part) => {
    const match = /^(type\s+)?([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(part);
    if (!match) throw new Error('Unsupported named export/import: ' + part);
    return { name: match[2], alias: match[3] ?? match[2], type: Boolean(match[1]) };
  });
}

function resolveModule(from, specifier) {
  if (!specifier.startsWith('.')) return null;
  const resolved = path.resolve(path.dirname(from), specifier);
  const candidates = [resolved, resolved + '.ts', resolved + '.tsx', resolved + '.mts', path.join(resolved, 'index.ts')];
  return candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) ?? null;
}

function facadeExports(file, source) {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const declarations = [...withoutComments.matchAll(REEXPORT)];
  if (!declarations.length || withoutComments.replace(REEXPORT, '').trim() !== '') return null;
  const symbols = new Map();
  for (const match of declarations) {
    const owner = resolveModule(file, match[4]);
    if (!owner || owner === file) throw new Error('Invalid re-export owner ' + match[4] + ' in ' + file);
    for (const item of splitNames(match[2])) {
      if (symbols.has(item.alias)) throw new Error('Duplicate facade export: ' + item.alias);
      symbols.set(item.alias, { owner, exported: item.name, type: Boolean(match[1]) || item.type });
    }
  }
  return symbols;
}

function relativeSpecifier(from, target) {
  let specifier = path.relative(path.dirname(from), target).replaceAll('\\', '/').replace(/\.(?:ts|tsx|mts)$/, '');
  if (!specifier.startsWith('.')) specifier = './' + specifier;
  return specifier;
}

function rewriteFile(file, source, facade, symbols) {
  let changed = false;
  const rewritten = source.replace(FORWARD, (whole, kind, typeOnly, body, quote, specifier) => {
    if (resolveModule(file, specifier) !== facade) return whole;
    const groups = new Map();
    for (const item of splitNames(body)) {
      const mapped = symbols.get(item.name);
      if (!mapped) throw new Error('Unknown facade symbol ' + item.name + ' in ' + file);
      const spec = (item.type || mapped.type) ? 'type ' : '';
      const exported = mapped.exported + (item.alias !== item.name ? ' as ' + item.alias : '');
      const owner = relativeSpecifier(file, mapped.owner);
      const key = owner + '|' + (typeOnly ? 'type' : 'value');
      if (!groups.has(key)) groups.set(key, { owner, items: [] });
      groups.get(key).items.push(spec + exported);
    }
    changed = true;
    return [...groups.values()].map((group) => {
      const items = group.items.map((name) => typeOnly ? name.replace(/^type /, '') : name);
      return kind + ' ' + (typeOnly ? 'type ' : '') + '{ ' + items.join(', ') + ' } from ' +
        quote + group.owner + quote + ';';
    }).join('\n');
  });
  for (const reference of rewritten.matchAll(REFERENCE)) {
    if (resolveModule(file, reference[2]) === facade) {
      throw new Error('Unsupported or unmigrated facade reference in ' + path.relative(ROOT, file) + ': ' + reference[0]);
    }
  }
  return changed ? rewritten : source;
}

function main() {
  const [target, flag] = process.argv.slice(2);
  if (target === '--scan') {
    for (const file of sourceFiles(path.join(ROOT, 'src'))) {
      const source = readFileSync(file, 'utf8');
      if (facadeExports(file, source)) console.log(path.relative(ROOT, file).replaceAll('\\', '/'));
    }
    return;
  }
  if (!target || path.isAbsolute(target) || target.startsWith('..') || !target.endsWith('.ts')
    || (flag && flag !== '--apply')) {
    throw new Error('Usage: node scripts/migrate-compat-facades.mjs <src/path.ts> [--apply] | --scan');
  }
  const facade = path.resolve(ROOT, target);
  if (!facade.startsWith(path.join(ROOT, 'src') + path.sep)) throw new Error('Only src/ facades can be migrated');
  const symbols = facadeExports(facade, readFileSync(facade, 'utf8'));
  if (!symbols) throw new Error(target + ' contains implementation logic or unsupported exports; refusing to remove');
  const changes = [];
  const files = [...sourceFiles(path.join(ROOT, 'src')), ...sourceFiles(path.join(ROOT, 'tests')),
    ...sourceFiles(path.join(ROOT, 'scripts')), ...sourceFiles(path.join(ROOT, 'config')),
    ...['knip.ts', 'vite.config.ts'].map((name) => path.join(ROOT, name)).filter(existsSync)];
  for (const file of files) {
    if (file === facade) continue;
    const before = readFileSync(file, 'utf8');
    const after = rewriteFile(file, before, facade, symbols);
    if (after !== before) changes.push({ file, after });
  }
  console.log('Facade: ' + target + ' (' + symbols.size + ' exports), callers: ' + changes.length);
  for (const change of changes) console.log('  ' + path.relative(ROOT, change.file));
  if (flag !== '--apply') {
    console.log('Dry run only; use --apply after reviewing callers and non-import references.');
    return;
  }
  for (const change of changes) writeFileSync(change.file, change.after, 'utf8');
  unlinkSync(facade);
  console.log('Migrated and removed ' + target);
}

try { main(); } catch (error) { console.error(error); process.exitCode = 1; }
