/**
 * Call-graph and ownership explorer generator.
 *
 * Reads `src/**\/*.{ts,tsx}` plus the two authoritative ownership sources
 * (`src/game/simulation/decisionRegistry.ts` and `OWNERSHIP_OVERVIEW.md`) and writes:
 *
 *   docs/tools/call-graph.json   machine-readable: functions, call edges, owners, decisions
 *   docs/tools/call-graph.html   self-contained interactive viewer (no server, no CDN)
 *
 * Fidelity: static, regex/lexer-level. A call edge means "this function's body contains
 * `name(` resolved through the file's own imports". Dynamic dispatch, re-exports used as
 * namespaces, and same-name collisions that no import disambiguates are reported as
 * `ambiguous` rather than guessed.
 *
 * Usage: node scripts/build-call-graph.mjs [--json-only]
 */
import { readdirSync, readFileSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.resolve(ROOT, 'src');
const OUT_DIR = path.resolve(ROOT, 'docs/tools');
const SOURCE_EXTENSIONS = ['.ts', '.tsx'];
const ALIAS_PREFIX = '@/';

const KEYWORDS = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof', 'new', 'await', 'yield',
  'else', 'do', 'case', 'in', 'of', 'instanceof', 'delete', 'void', 'throw', 'super', 'this',
  'constructor', 'get', 'set', 'import', 'export', 'default', 'extends', 'implements',
]);

// ---------------------------------------------------------------------------------------------
// Lexing
// ---------------------------------------------------------------------------------------------

function collectSources(directory, out = []) {
  for (const entry of readdirSync(directory)) {
    const full = path.resolve(directory, entry);
    if (statSync(full).isDirectory()) collectSources(full, out);
    else if (SOURCE_EXTENSIONS.some((ext) => entry.endsWith(ext))) out.push(full);
  }
  return out;
}

/**
 * Walk a source file once, tracking comments and string literals so braces, definitions and call
 * sites inside them are ignored. Returns the code with literals replaced by spaces (same length,
 * so line numbers stay right) plus the raw text for import extraction.
 */
export function stripLiteralsAndComments(text) {  const out = text.split('');
  let i = 0;
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < text.length) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      const end = text.indexOf('\n', i);
      const stop = end === -1 ? text.length : end;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end === -1 ? text.length : end + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue; }
        if (text[j] === c) { j++; break; }
        if (c === '`' && text[j] === '$' && text[j + 1] === '{') {
          // Keep template interpolations as code: skip to the matching brace.
          let depth = 1;
          j += 2;
          while (j < text.length && depth > 0) {
            if (text[j] === '{') depth++;
            else if (text[j] === '}') depth--;
            else if (text[j] === '"' || text[j] === "'" || text[j] === '`') {
              const quote = text[j];
              j++;
              while (j < text.length && text[j] !== quote) { if (text[j] === '\\') j++; j++; }
            }
            j++;
          }
          continue;
        }
        if (c !== '`' && text[j] === '\n') break; // unterminated single-line string
        j++;
      }
      // Blank everything except interpolated regions: approximate by blanking quotes/content.
      for (let k = i + 1; k < j - 1; k++) {
        if (out[k] !== '\n' && !(c === '`' && text[k] === '$' && text[k + 1] === '{')) out[k] = ' ';
      }
      i = j;
      continue;
    }
    i++;
  }
  return out.join('');
}

const lineOf = (text, index) => {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === '\n') line++;
  return line;
};

function matchBrace(code, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return code.length - 1;
}

/** Resolve a specifier base to a real module file (directory → index.ts, extension probe). */
function resolveModuleFile(absBase) {
  const probes = [absBase, `${absBase}.ts`, `${absBase}.tsx`, path.join(absBase, 'index.ts'), path.join(absBase, 'index.tsx')];
  for (const probe of probes) {
    try {
      if (statSync(probe).isFile()) return probe;
    } catch {
      // keep probing
    }
  }
  return absBase;
}

/** Local name → resolved absolute module path (relative imports only; bare packages ignored). */
function extractImports(raw, file) {
  const map = new Map();
  const patterns = [
    /\bimport\s+(?:type\s+)?([\s\S]*?)\bfrom\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  const resolve = (specifier) => {
    if (specifier.startsWith('.')) return resolveModuleFile(path.resolve(path.dirname(file), specifier));
    if (specifier.startsWith(ALIAS_PREFIX)) return resolveModuleFile(path.resolve(SRC, specifier.slice(ALIAS_PREFIX.length)));
    return null;
  };
  for (const pattern of patterns) {
    for (const match of raw.matchAll(pattern)) {
      const specifier = match[2] ?? match[1];
      const base = resolve(specifier);
      if (!base) continue;
      if (!match[2]) continue; // dynamic import: no local binding
      const clause = match[1];
      const named = clause.match(/\{([\s\S]*?)\}/);
      if (named) {
        for (const part of named[1].split(',')) {
          const name = part.replace(/\btype\b/, '').split(/\s+as\s+/).pop()?.trim();
          if (name) map.set(name, base);
        }
      }
      const star = clause.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
      if (star) map.set(star[1], base);
      const defaultImport = clause.replace(/\{[\s\S]*?\}/, '').replace(/,/g, ' ').trim();
      if (defaultImport && /^[A-Za-z_$][\w$]*$/.test(defaultImport)) map.set(defaultImport, base);
    }
  }
  return map;
}

/**
 * Re-export barrels: `export { a } from './x'` and `export * from './x'`. A call site that imports
 * from a barrel (`import { x } from '../audio'`, `dayCycle.ts`) has to be resolved through it.
 */
function extractReExports(raw, file) {
  const named = new Map();
  const wildcards = [];
  for (const match of raw.matchAll(/\bexport\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const target = path.relative(ROOT, resolveModuleFile(path.resolve(path.dirname(file), match[2]))).replaceAll('\\', '/');
    for (const part of match[1].split(',')) {
      const alias = part.split(/\s+as\s+/).pop()?.trim().replace(/\btype\b/, '').trim();
      if (alias) named.set(alias, target);
    }
  }
  for (const match of raw.matchAll(/\bexport\s*\*\s*from\s*['"]([^'"]+)['"]/g)) {
    wildcards.push(path.relative(ROOT, resolveModuleFile(path.resolve(path.dirname(file), match[1]))).replaceAll('\\', '/'));
  }
  return { named, wildcards };
}

const DEFINITION_PATTERNS = [
  { kind: 'function', re: /(?:^|\n)[ \t]*(export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<[^>(]*>)?\s*\(/g },
  { kind: 'const-arrow', re: /(?:^|\n)[ \t]*(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=;{]*)?=>/g },
  { kind: 'const-function', re: /(?:^|\n)[ \t]*(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*(?:async\s+)?function\s*\(/g },
  // Class methods and object-literal methods: `private async frame(...) {`, `  foo(a, b): T {`.
  { kind: 'method', re: /(?:^|\n)[ \t]+(export\s+)?(?:(?:public|private|protected|static|readonly|async|override|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\([^;{}]*\)\s*(?::[^{;=]*)?\{/g, blockBody: true },
  // Assigned handlers: `self.onmessage = async (event) => {`, `private frame = () => {`.
  // A block body is required here, so a property *type* such as
  // `private getCanvas: () => HTMLCanvasElement | null;` is not mistaken for a function.
  { kind: 'handler', re: /(?:^|\n)[ \t]*(export\s+)?(?:(?:public|private|protected|static|readonly|async)\s+)*(?:[A-Za-z_$][\w$.]*\.)?([A-Za-z_$][\w$]*)\s*[:=]\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::[^=;{]*)?=>/g, blockBody: true },
];

/**
 * Index of the `{` that opens a block body, or -1 when the statement has none (a signature, a
 * property type, or a concise arrow). Bounded and terminated by `;`, `}` or a blank line so a
 * bodyless declaration cannot adopt the *next* function's braces.
 */
function findBodyBrace(code, from) {
  const limit = Math.min(code.length, from + 400);
  for (let i = from; i < limit; i++) {
    const ch = code[i];
    if (ch === '{') return i;
    if (ch === ';' || ch === '}') return -1;
    if (ch === '\n' && /^\s*\n/.test(code.slice(i + 1, i + 3))) return -1;
  }
  return -1;
}

/** `class Name extends Base {` ranges, so a method can be attributed to its class. */
function extractClasses(code, raw) {
  const classes = [];
  const re = /(?:^|\n)[ \t]*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)(?:\s+extends\s+([A-Za-z_$][\w$.]*))?[^{;]*\{/g;
  for (const match of code.matchAll(re)) {
    const braceIndex = match.index + match[0].length - 1;
    classes.push({
      name: match[1],
      extends: match[2] ? match[2].split('.').pop() : null,
      bodyStart: lineOf(raw, braceIndex),
      bodyEnd: lineOf(raw, matchBrace(code, braceIndex)),
    });
  }
  return classes;
}

/** Parameter names and `name: ClassName` hints from a definition's parameter list. */
function parseParams(code, fromIndex) {
  const open = code.indexOf('(', fromIndex);
  if (open === -1) return { names: [], types: new Map() };
  let depth = 0;
  let close = open;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  const names = [];
  const types = new Map();
  for (const part of code.slice(open + 1, close).split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const typed = trimmed.match(/^([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*)/);
    const bare = trimmed.match(/^([A-Za-z_$][\w$]*)/);
    if (typed) {
      names.push(typed[1]);
      types.set(typed[1], typed[2]);
    } else if (bare) {
      names.push(bare[1]);
    }
  }
  return { names, types };
}

/** `const x = new Cls(` / `let x: Cls = new Cls(` — the receiver types a call site can use. */
function extractInstances(code, raw) {
  const instances = [];
  const re = /(?:^|\n)[ \t]*(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?\s*=\s*new\s+([A-Za-z_$][\w$]*)/g;
  for (const match of code.matchAll(re)) {
    instances.push({
      variable: match[1],
      className: match[2] ?? match[3],
      line: lineOf(raw, match.index),
    });
  }
  return instances;
}

export function extractDefinitions(code, raw, file, classes = []) {
  const defs = [];
  const seen = new Set();
  const filePath = path.relative(ROOT, file).replaceAll('\\', '/');
  for (const { kind, re, blockBody } of DEFINITION_PATTERNS) {
    for (const match of code.matchAll(re)) {
      // The patterns anchor on `(?:^|\n)`, so the match can start one character before the code.
      // Brace math must use the raw match bounds, never the content-adjusted index.
      const matchStart = match.index;
      const contentStart = matchStart + (match[0].startsWith('\n') ? 1 : 0);
      const name = match[2];
      if (!name || KEYWORDS.has(name)) continue;

      // A `name: (args) => …` inside a parameter list is a *parameter*, not a definition
      // (`rng: () => number = Math.random` produced nine phantom functions).
      let before = contentStart - 1;
      while (before >= 0 && (code[before] === ' ' || code[before] === '\t' || code[before] === '\n' || code[before] === '\r')) before--;
      if (code[before] === '(' || code[before] === ',') continue;

      const line = lineOf(raw, contentStart);
      const dedupeKey = `${name}:${line}`;
      if (seen.has(dedupeKey)) continue;

      const braceIndex = match[0].endsWith('{')
        ? matchStart + match[0].length - 1
        : findBodyBrace(code, matchStart + match[0].length);
      if (blockBody && braceIndex === -1) continue;
      seen.add(dedupeKey);

      const bodyStartLine = braceIndex === -1 ? line : lineOf(raw, braceIndex);
      const bodyEndLine = braceIndex === -1 ? line : lineOf(raw, matchBrace(code, braceIndex));
      const owner = classes
        .filter((cls) => line >= cls.bodyStart && line <= cls.bodyEnd)
        .sort((a, b) => (a.bodyEnd - a.bodyStart) - (b.bodyEnd - b.bodyStart))[0];
      const params = kind === 'method' ? { names: [], types: new Map() } : parseParams(code, contentStart);
      defs.push({
        name,
        file: filePath,
        line,
        exported: Boolean(match[1]),
        kind,
        className: owner?.name ?? null,
        params: params.names,
        paramTypes: params.types,
        bodyStart: bodyStartLine,
        bodyEnd: bodyEndLine,
      });
    }
  }
  return defs;
}

/**
 * Calls with their optional receiver. `this.foo(` → receiver `this`; `X.foo(` → receiver `X`;
 * `foo(` → receiver null. The receiver is what lets the resolver tell a class method from a
 * same-named free function, and a built-in (`array.push`) from an internal one.
 */
function extractCalls(code, file) {
  const calls = [];
  const filePath = path.relative(ROOT, file).replaceAll('\\', '/');
  // Receiver forms: `X.foo(` (identifier), and member expressions — `x.get(id)?.add(`,
  // `allAlive?.push(`, `byType[k].push(` — recorded as an anonymous receiver (`?`) because no
  // internal definition can be tied to them.
  const re = /(?:([A-Za-z_$][\w$]*)\s*\.\s*|([A-Za-z_$][\w$]*)\s*\?\.\s*|([)\]])\s*\??\.\s*)?([A-Za-z_$][\w$]*)\s*\(/g;
  for (const match of code.matchAll(re)) {
    const name = match[4];
    if (KEYWORDS.has(name)) continue;
    const before = code.slice(Math.max(0, match.index - 30), match.index);
    if (/\b(function|const|let|var|class|interface|type|new|extends)\s*$/.test(before)) continue;
    calls.push({
      name,
      receiver: match[1] ?? (match[2] || match[3] ? '?' : null),
      file: filePath,
      line: lineOf(code, match.index),
    });
  }
  return calls;
}

// ---------------------------------------------------------------------------------------------
// Ownership sources
// ---------------------------------------------------------------------------------------------

function parseDecisionRegistry(file) {
  const raw = readFileSync(file, 'utf8');
  const entries = [];
  const re = /^ {2}([A-Za-z_$][\w$]*):\s*\{([\s\S]*?)^ {2}\},/gm;
  for (const match of raw.matchAll(re)) {
    const key = match[1];
    const body = match[2];
    const field = (name) => {
      const single = body.match(new RegExp(`\\b${name}:\\s*'([^']*)'`));
      if (single) return single[1];
      const list = body.match(new RegExp(`\\b${name}:\\s*\\[([\\s\\S]*?)\\]`));
      if (list) return list[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
      return undefined;
    };
    entries.push({
      source: 'decisionRegistry.ts',
      key,
      owner: field('owner'),
      cadence: field('cadence'),
      cadenceNote: field('cadenceNote'),
      writes: field('writes') ?? [],
      scheduledFrom: field('scheduledFrom'),
      testFile: field('testFile'),
    });
  }
  return entries;
}

function parseOwnershipOverview(file) {
  const raw = readFileSync(file, 'utf8');
  const entries = [];
  for (const line of raw.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 6) continue;
    const [, decision, owner, cadence, entryFunctions] = cells;
    if (!decision || decision === 'Decision' || /^-+$/.test(decision)) continue;
    if (!owner) continue;
    entries.push({
      source: 'OWNERSHIP_OVERVIEW.md',
      key: decision,
      owner,
      cadence,
      cadenceNote: undefined,
      writes: [],
      scheduledFrom: undefined,
      testFile: undefined,
      entryFunctionsCell: entryFunctions ?? '',
    });
  }
  return entries;
}

/** Module file names mentioned in an ownership prose cell (normalised to basenames). */
function modulesIn(text) {
  if (!text) return [];
  const found = new Set();
  for (const match of text.matchAll(/([A-Za-z][\w./-]*\.tsx?)/g)) found.add(match[1].split('/').pop());
  return [...found];
}

// ---------------------------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------------------------

function main() {
  const jsonOnly = process.argv.includes('--json-only');
  const files = collectSources(SRC);

  const functions = [];
  const callsByFile = new Map();
  const importsByFile = new Map();
  const classesByFile = new Map();
  const instancesByFile = new Map();
  const reExportsByFile = new Map();

  for (const file of files) {
    const raw = readFileSync(file, 'utf8');
    const code = stripLiteralsAndComments(raw);
    const classes = extractClasses(code, raw);
    const relFile = path.relative(ROOT, file).replaceAll('\\', '/');
    for (const def of extractDefinitions(code, raw, file, classes)) functions.push(def);
    callsByFile.set(relFile, extractCalls(code, file));
    importsByFile.set(relFile, extractImports(raw, file));
    classesByFile.set(relFile, classes);
    instancesByFile.set(relFile, extractInstances(code, raw));
    reExportsByFile.set(relFile, extractReExports(raw, file));
  }

  const byName = new Map();
  const byClassMethod = new Map();
  for (const [index, fn] of functions.entries()) {
    fn.index = index;
    const list = byName.get(fn.name) ?? [];
    list.push(fn);
    byName.set(fn.name, list);
    if (fn.className) byClassMethod.set(`${fn.className}::${fn.name}`, fn);
  }

  const resolveImportTarget = (file, localName) => {
    const imported = importsByFile.get(file)?.get(localName);
    if (!imported) return undefined;
    return path.relative(ROOT, imported).replaceAll('\\', '/');
  };

  /** Direct hit in a module, else one hop through its re-export barrel. */
  const resolveThroughModule = (moduleFile, name, candidates) => {
    const direct = candidates.find((c) => c.file === moduleFile);
    if (direct) return direct;
    const barrels = reExportsByFile.get(moduleFile);
    if (!barrels) return undefined;
    const namedTarget = barrels.named.get(name);
    if (namedTarget) {
      const found = candidates.find((c) => c.file === namedTarget);
      if (found) return found;
    }
    for (const wildcard of barrels.wildcards) {
      const found = candidates.find((c) => c.file === wildcard);
      if (found) return found;
    }
    return undefined;
  };

  /** Method lookup with a single `extends` hop inside the same file. */
  const resolveMethod = (classes, className, methodName) => {
    let current = className;
    for (let hop = 0; hop < 4 && current; hop++) {
      const found = byClassMethod.get(`${current}::${methodName}`);
      if (found) return found;
      current = classes.find((cls) => cls.name === current)?.extends ?? null;
    }
    return undefined;
  };

  // callers[i] = [{ index, file, line }], callees[i] = [{ index, file, line }]
  const callers = functions.map(() => []);
  const callees = functions.map(() => []);
  const unresolved = new Map();
  const resolutionKinds = {
    local: 0,
    imported: 0,
    namespace: 0,
    methodThis: 0,
    methodInstance: 0,
    injectedCallback: 0,
    external: 0,
    uniqueName: 0,
  };

  /** Innermost function in `file` whose body contains `line`. */
  const ownerOfLine = (() => {
    const perFile = new Map();
    for (const fn of functions) {
      const list = perFile.get(fn.file) ?? [];
      list.push(fn);
      perFile.set(fn.file, list);
    }
    return (file, line) => {
      let best;
      for (const fn of perFile.get(file) ?? []) {
        if (line >= fn.bodyStart && line <= fn.bodyEnd) {
          if (!best || fn.bodyEnd - fn.bodyStart < best.bodyEnd - best.bodyStart) best = fn;
        }
      }
      return best;
    };
  })();

  for (const [file, calls] of callsByFile) {
    const classes = classesByFile.get(file) ?? [];
    const instances = instancesByFile.get(file) ?? [];
    for (const call of calls) {
      const caller = ownerOfLine(file, call.line);
      if (!caller) continue;

      let target;
      let kind;
      const candidates = byName.get(call.name) ?? [];

      if (call.receiver === 'this') {
        target = resolveMethod(classes, caller.className, call.name);
        kind = 'methodThis';
      } else if (call.receiver) {
        const importedTarget = resolveImportTarget(file, call.receiver);
        if (importedTarget) {
          // `import * as X` (or a default import) used as a namespace: the module's own export,
          // possibly through its re-export barrel.
          target = resolveThroughModule(importedTarget, call.name, candidates);
          kind = 'namespace';
        }
        if (!target) {
          const instance = instances.find((i) => i.variable === call.receiver && i.line <= call.line);
          const paramType = caller.paramTypes?.get(call.receiver);
          const className = instance?.className ?? paramType ?? null;
          if (className) {
            target = resolveMethod(classes, className, call.name);
            if (target) kind = 'methodInstance';
          }
        }
        // Any receiver call we cannot tie to an internal definition is an external method —
        // `array.push`, `Set.add`, `callbacks.logEvent`, a library object. Not an ambiguity.
        if (!target) kind = 'external';
      } else if (caller.params?.includes(call.name)) {
        // A function-typed parameter being invoked: `rng()`, `fn(x)`. The callee is injected at the
        // call site, not defined here.
        kind = 'injectedCallback';
      } else {
        const importedFile = resolveImportTarget(file, call.name);
        if (importedFile) {
          target = resolveThroughModule(importedFile, call.name, candidates);
          if (target) kind = 'imported';
        }
        if (!target) {
          target = candidates.find((c) => c.file === file);
          if (target) kind = 'local';
        }
        if (!target && candidates.length === 1) {
          target = candidates[0];
          kind = 'uniqueName';
        }
      }

      if (!target) {
        if (kind === 'external' || kind === 'injectedCallback') {
          resolutionKinds[kind]++;
        } else if (candidates.length === 0) {
          // A bare call with no internal definition of that name: a global/built-in
          // (`structuredClone`, `setTimeout`, `parseInt`) or a DOM/Node API.
          resolutionKinds.external++;
        } else {
          // Same name defined in several modules, no import and no receiver to disambiguate.
          const key = `${call.name} (${candidates.length} definitions)`;
          const entry = unresolved.get(key) ?? { count: 0, sites: [] };
          entry.count++;
          if (entry.sites.length < 6) entry.sites.push(`${call.file}:${call.line}`);
          unresolved.set(key, entry);
        }
        continue;
      }

      resolutionKinds[kind]++;
      if (target.index === caller.index) continue;
      if (callees[caller.index].some((e) => e.index === target.index)) continue;
      callees[caller.index].push({ index: target.index, file: target.file, line: call.line });
      callers[target.index].push({ index: caller.index, file: caller.file, line: call.line });
    }
  }

  // --- ownership ------------------------------------------------------------------------------
  const registry = parseDecisionRegistry(path.resolve(SRC, 'game/simulation/decisionRegistry.ts'));
  const overview = parseOwnershipOverview(path.resolve(ROOT, 'OWNERSHIP_OVERVIEW.md'));
  const decisions = [...registry, ...overview];

  const functionNames = new Set(functions.map((f) => f.name));
  const fileBasenames = new Map();
  for (const fn of functions) {
    const base = fn.file.split('/').pop();
    const list = fileBasenames.get(base) ?? new Set();
    list.add(fn.file);
    fileBasenames.set(base, list);
  }

  for (const decision of decisions) {
    // Names and modules come from the owner / entry-functions cells only. scheduledFrom names the
    // scheduler, not the owner — using it here made `tick` belong to housing and `start` to audio.
    const text = [decision.owner, decision.entryFunctionsCell].filter(Boolean).join(' ');
    const named = new Set();
    for (const match of text.matchAll(/\b([a-z][A-Za-z0-9_]*)\b/g)) {
      if (functionNames.has(match[1])) named.add(match[1]);
    }
    for (const match of (decision.entryFunctionsCell ?? '').matchAll(/`([^`]+)`/g)) {
      for (const part of match[1].split(/[,·]\s*/)) {
        const name = part.trim().replace(/\(.*$/, '');
        if (functionNames.has(name)) named.add(name);
      }
    }
    decision.entryFunctionNames = [...named].sort();
    // Registry owner cells are `module.ts — function list; also runs from scheduler.ts`.
    // Only the prefix before the em dash is the owning module list.
    const ownerHead = (() => {
      const text = decision.owner ?? '';
      const cut = text.indexOf('—');
      return cut === -1 ? text : text.slice(0, cut);
    })();
    decision.modules = [...new Set(modulesIn(ownerHead))].sort();
  }

  const ownerForFunction = (fn) => {
    const base = fn.file.split('/').pop();
    for (const decision of decisions) {
      if (
        decision.entryFunctionNames.includes(fn.name)
        && decision.modules.includes(base)
      ) {
        return { decision, how: 'entry function' };
      }
    }
    for (const decision of decisions) {
      if (decision.modules.includes(base)) return { decision, how: 'module owner' };
    }
    return undefined;
  };

  for (const fn of functions) {
    const owner = ownerForFunction(fn);
    fn.ownerKey = owner?.decision.key ?? null;
    fn.ownerSource = owner?.decision.source ?? null;
    fn.ownerHow = owner?.how ?? null;
    fn.ownerOwnerCell = owner?.decision.owner ?? null;
    fn.cadence = owner?.decision.cadence ?? null;
    fn.callerCount = callers[fn.index].length;
    fn.calleeCount = callees[fn.index].length;
    delete fn.bodyStart;
    delete fn.bodyEnd;
  }

  const payload = {
    generatedFrom: 'src/**/*.{ts,tsx} + decisionRegistry.ts + OWNERSHIP_OVERVIEW.md',
    generatedAt: new Date().toISOString(),
    stats: {
      files: files.length,
      functions: functions.length,
      callEdges: callees.reduce((sum, list) => sum + list.length, 0),
      withRecordedOwner: functions.filter((f) => f.ownerKey).length,
      decisions: decisions.length,
      ambiguousCalls: [...unresolved.values()].reduce((sum, entry) => sum + entry.count, 0),
      // How each call site was classified — see `resolutionKinds` and the README's resolution ladder.
      injectedCallbackCalls: resolutionKinds.injectedCallback,
      externalMethodCalls: resolutionKinds.external,
      resolutionKinds,
    },
    decisions: decisions.map((d) => ({
      key: d.key,
      source: d.source,
      owner: d.owner,
      cadence: d.cadence,
      cadenceNote: d.cadenceNote ?? null,
      scheduledFrom: d.scheduledFrom ?? null,
      writes: d.writes ?? [],
      testFile: d.testFile ?? null,
      modules: d.modules,
      entryFunctions: d.entryFunctionNames,
    })),
    functions: functions.map((fn) => ({
      name: fn.name,
      file: fn.file,
      line: fn.line,
      exported: fn.exported,
      kind: fn.kind,
      className: fn.className,
      ownerKey: fn.ownerKey,
      ownerSource: fn.ownerSource,
      ownerHow: fn.ownerHow,
      cadence: fn.cadence,
      callers: callers[fn.index],
      callees: callees[fn.index],
    })),
    ambiguous: [...unresolved.entries()]
      .map(([key, entry]) => ({ key, count: entry.count, sites: entry.sites }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, 'call-graph.json'), JSON.stringify(payload, null, 1));
  if (!jsonOnly) writeFileSync(path.join(OUT_DIR, 'call-graph.html'), renderHtml(payload));

  console.log(JSON.stringify(payload.stats, null, 2));
  console.log(`wrote docs/tools/call-graph.json${jsonOnly ? '' : ' and call-graph.html'}`);
}

// ---------------------------------------------------------------------------------------------
// HTML viewer (self-contained; no network, no dependencies)
// ---------------------------------------------------------------------------------------------

function renderHtml(payload) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Wilderfolk — call graph & ownership</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; height: 100vh; display: flex; flex-direction: column;
         background: #0f172a; color: #e2e8f0;
         font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  header { display: flex; gap: 12px; align-items: center; padding: 8px 12px;
           background: #1e293b; border-bottom: 1px solid #334155; flex: 0 0 auto; }
  header h1 { font-size: 14px; margin: 0; font-weight: 700; letter-spacing: .02em; }
  header .stats { color: #94a3b8; }
  nav button { background: #334155; color: #e2e8f0; border: 0; border-radius: 6px;
               padding: 5px 10px; cursor: pointer; font: inherit; }
  nav button.active { background: #0ea5e9; color: #06202e; font-weight: 700; }
  main { flex: 1 1 auto; min-height: 0; display: none; }
  main.active { display: flex; }
  .pane { overflow: auto; padding: 10px; }
  #list { flex: 0 0 320px; border-right: 1px solid #334155; background: #111c30; }
  #graphPane { flex: 1 1 auto; position: relative; min-width: 0; }
  #detail { flex: 0 0 340px; border-left: 1px solid #334155; background: #111c30; }
  input[type=search] { width: 100%; padding: 6px 8px; border-radius: 6px; border: 1px solid #334155;
                       background: #0b1220; color: #e2e8f0; font: inherit; margin-bottom: 8px; }
  .item { padding: 4px 6px; border-radius: 5px; cursor: pointer; display: flex;
          justify-content: space-between; gap: 8px; }
  .item:hover { background: #1e293b; }
  .item.sel { background: #0ea5e9; color: #06202e; }
  .item .meta { color: #94a3b8; font-size: 11px; white-space: nowrap; }
  .item.sel .meta { color: #082f49; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px;
         vertical-align: middle; }
  #canvas { position: relative; width: 100%; height: 100%; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .node { position: absolute; transform: translate(-50%, -50%); max-width: 240px;
          padding: 6px 9px; border-radius: 8px; border: 1px solid #475569; background: #1e293b;
          cursor: pointer; text-align: center; }
  .node.center { border-color: #0ea5e9; background: #0c4a6e; font-weight: 700; max-width: 300px; }
  .node .file { display: block; color: #94a3b8; font-size: 10px; }
  .node.center .file { color: #bae6fd; }
  .col-label { position: absolute; top: 6px; color: #64748b; text-transform: uppercase;
               font-size: 10px; letter-spacing: .08em; }
  h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: #94a3b8;
       margin: 14px 0 6px; }
  h2:first-child { margin-top: 0; }
  table { width: 100%; border-collapse: collapse; }
  td, th { text-align: left; padding: 3px 6px; border-bottom: 1px solid #1e293b; vertical-align: top; }
  th { color: #94a3b8; font-weight: 600; }
  code { color: #7dd3fc; }
  .chip { display: inline-block; padding: 1px 7px; border-radius: 999px; background: #1e293b;
          border: 1px solid #334155; margin: 0 4px 4px 0; font-size: 11px; }
  .owner { border-left: 3px solid #0ea5e9; padding: 6px 8px; background: #0b1220; border-radius: 6px; }
  .muted { color: #94a3b8; }
  .decision { border: 1px solid #334155; border-radius: 8px; padding: 8px; margin-bottom: 8px;
              background: #111c30; }
  .decision h3 { margin: 0 0 4px; font-size: 13px; color: #7dd3fc; }
  mark { background: #facc15; color: #1c1917; border-radius: 3px; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 10px; background: #111c30;
            border-bottom: 1px solid #334155; max-height: 84px; overflow: auto; }
</style>
</head>
<body>
<header>
  <h1>Wilderfolk · call graph &amp; ownership</h1>
  <nav>
    <button id="tabFlow">Flow / decisions</button>
    <button id="tabFns" class="active">Functions</button>
    <button id="tabMods">Modules</button>
  </nav>
  <span class="stats" id="stats"></span>
</header>

<main id="viewFns" class="active">
  <aside class="pane" id="list">
    <input type="search" id="search" placeholder="filter by name, file or owner…" />
    <div id="items"></div>
  </aside>
  <section class="pane" id="graphPane">
    <div id="canvas">
      <svg id="edges"></svg>
    </div>
  </section>
  <aside class="pane" id="detail"></aside>
</main>

<main id="viewFlow">
  <aside class="pane" id="flowList" style="flex:0 0 360px;border-right:1px solid #334155;background:#111c30"></aside>
  <section class="pane" id="flowDetail"></section>
</main>

<main id="viewMods">
  <aside class="pane" id="modList" style="flex:0 0 360px;border-right:1px solid #334155;background:#111c30"></aside>
  <section class="pane" id="modDetail"></section>
</main>

<script id="payload" type="application/json">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script>
<script>
const data = JSON.parse(document.getElementById('payload').textContent);
const $ = (id) => document.getElementById(id);
$('stats').textContent = data.stats.functions + ' functions · ' + data.stats.callEdges +
  ' internal call edges · ' + data.stats.withRecordedOwner + ' owned · ' +
  data.stats.decisions + ' ownership rows · ' + data.stats.injectedCallbackCalls +
  ' injected callbacks · ' + data.stats.externalMethodCalls + ' external/prototype calls · ' +
  data.stats.ambiguousCalls + ' ambiguous';
$('stats').title = data.ambiguous.length
  ? 'Unresolved call sites:\\n' + data.ambiguous.map((a) => a.key + ' x' + a.count + ' - ' + (a.sites[0] || '')).join('\\n')
  : 'Every call site was classified.';

const colorFor = (() => {
  const cache = new Map();
  return (key) => {
    if (!key) return '#64748b';
    if (!cache.has(key)) {
      let hash = 0;
      for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
      cache.set(key, 'hsl(' + hash + ' 70% 60%)');
    }
    return cache.get(key);
  };
})();
const short = (f) => f.split('/').slice(-2).join('/');

// --- function view ---------------------------------------------------------------------------
const items = $('items');
let selected = data.functions.findIndex((f) => f.callees.length + f.callers.length > 0);
const history = [];

function renderList(filter) {
  const q = (filter || '').toLowerCase();
  const rows = data.functions
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => !q || f.name.toLowerCase().includes(q) || f.file.toLowerCase().includes(q)
      || (f.ownerKey || '').toLowerCase().includes(q))
    .sort((a, b) => (b.f.callers.length + b.f.callees.length) - (a.f.callers.length + a.f.callees.length));
  items.innerHTML = '';
  for (const { f, i } of rows.slice(0, 400)) {
    const div = document.createElement('div');
    div.className = 'item' + (i === selected ? ' sel' : '');
    div.innerHTML = '<span><span class="dot" style="background:' + colorFor(f.ownerKey) + '"></span>'
      + f.name + '</span><span class="meta">' + f.callers.length + '←' + f.callees.length + '→</span>';
    div.title = f.file + ':' + f.line + (f.ownerKey ? ' · owner: ' + f.ownerKey : ' · no recorded owner');
    div.onclick = () => select(i);
    items.appendChild(div);
  }
}

function nodeEl(f, i, cls, xPct, yPct) {
  const div = document.createElement('div');
  div.className = 'node' + (cls ? ' ' + cls : '');
  div.style.left = xPct + '%';
  div.style.top = yPct + '%';
  div.style.borderColor = colorFor(f.ownerKey);
  div.innerHTML = '<span style="color:' + colorFor(f.ownerKey) + '">' + f.name + '</span>'
    + '<span class="file">' + short(f.file) + ':' + f.line + '</span>';
  div.onclick = (event) => { event.stopPropagation(); if (i !== selected) { history.push(selected); select(i); } };
  return div;
}

function select(index) {
  selected = index;
  const f = data.functions[index];
  const canvas = $('canvas');
  canvas.innerHTML = '<svg id="edges"></svg>';
  const svg = $('edges');
  const callers = f.callers.slice(0, 14);
  const callees = f.callees.slice(0, 14);

  const addLabel = (text, xPct) => {
    const el = document.createElement('div');
    el.className = 'col-label';
    el.style.left = xPct + '%';
    el.textContent = text;
    canvas.appendChild(el);
  };
  addLabel('called by (' + f.callers.length + ')', '16%');
  addLabel('calls (' + f.callees.length + ')', '84%');

  const center = nodeEl(f, index, 'center', 50, 50);
  canvas.appendChild(center);

  const positions = [];
  callers.forEach((edge, i) => {
    const y = 12 + (i * 76) / Math.max(1, callers.length - 1 || 1);
    const node = nodeEl(data.functions[edge.index], edge.index, '', 14, y);
    canvas.appendChild(node);
    positions.push({ from: node, to: center, key: f.ownerKey });
  });
  callees.forEach((edge, i) => {
    const y = 12 + (i * 76) / Math.max(1, callees.length - 1 || 1);
    const node = nodeEl(data.functions[edge.index], edge.index, '', 86, y);
    canvas.appendChild(node);
    positions.push({ from: center, to: node, key: data.functions[edge.index].ownerKey });
  });

  requestAnimationFrame(() => {
    const box = canvas.getBoundingClientRect();
    svg.setAttribute('viewBox', '0 0 ' + box.width + ' ' + box.height);
    let paths = '';
    for (const { from, to, key } of positions) {
      const a = from.getBoundingClientRect();
      const b = to.getBoundingClientRect();
      const x1 = a.left + a.width / 2 - box.left, y1 = a.top + a.height / 2 - box.top;
      const x2 = b.left + b.width / 2 - box.left, y2 = b.top + b.height / 2 - box.top;
      const mx = (x1 + x2) / 2;
      paths += '<path d="M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ' ' + mx + ' ' + y2 + ' ' + x2 + ' ' + y2
        + '" fill="none" stroke="' + colorFor(key) + '" stroke-opacity="0.55" stroke-width="1.5" />';
    }
    svg.innerHTML = paths;
  });

  renderDetail(f, index);
  renderList($('search').value);
}

function renderDetail(f, index) {
  const d = $('detail');
  const decision = f.ownerKey ? data.decisions.find((x) => x.key === f.ownerKey) : null;
  d.innerHTML = ''
    + '<h2>' + f.name + '</h2>'
    + '<div class="muted">' + f.file + ':' + f.line + ' · ' + (f.exported ? 'exported ' : '')
    + f.kind + '</div>'
    + '<h2>Ownership</h2>'
    + (f.ownerKey
        ? '<div class="owner"><b style="color:' + colorFor(f.ownerKey) + '">' + f.ownerKey + '</b>'
          + ' <span class="muted">(' + f.ownerSource + ', matched by ' + f.ownerHow + ')</span><br>'
          + '<span class="muted">cadence:</span> ' + (f.cadence || '—') + '</div>'
          + (decision && decision.owner ? '<p class="muted">' + decision.owner + '</p>' : '')
          + (decision && decision.scheduledFrom ? '<p><span class="muted">scheduled from:</span> ' + decision.scheduledFrom + '</p>' : '')
          + (decision && decision.writes && decision.writes.length
              ? '<p><span class="muted">writes:</span> ' + decision.writes.map((w) => '<span class="chip">' + w + '</span>').join('') + '</p>'
              : '')
          + (decision && decision.testFile ? '<p><span class="muted">tests:</span> ' + decision.testFile + '</p>' : '')
        : '<div class="owner" style="border-color:#f59e0b">no recorded owner</div>'
          + '<p class="muted">Not named as a decision entry function, and its file is not an owner module in the registry or the ownership overview.</p>')
    + '<h2>Called by (' + f.callers.length + ')</h2>'
    + '<table>' + f.callers.slice(0, 60).map((e) => '<tr><td><a href="#" data-go="' + e.index + '">'
        + data.functions[e.index].name + '</a></td><td class="muted">' + short(e.file) + '</td></tr>').join('') + '</table>'
    + '<h2>Calls (' + f.callees.length + ')</h2>'
    + '<table>' + f.callees.slice(0, 60).map((e) => '<tr><td><a href="#" data-go="' + e.index + '">'
        + data.functions[e.index].name + '</a></td><td class="muted">' + short(e.file) + '</td></tr>').join('') + '</table>';
  d.querySelectorAll('[data-go]').forEach((a) => {
    a.onclick = (event) => { event.preventDefault(); history.push(selected); select(Number(a.dataset.go)); };
  });
}

$('search').oninput = (event) => renderList(event.target.value);

// --- flow / decisions view --------------------------------------------------------------------
function renderFlow() {
  const list = $('flowList');
  const detail = $('flowDetail');
  list.innerHTML = '<input type="search" id="flowSearch" placeholder="filter decisions…" /><div id="flows"></div>';
  const flows = $('flows');
  const rows = data.decisions;
  const paint = (filter) => {
    const q = (filter || '').toLowerCase();
    flows.innerHTML = '';
    rows.filter((d) => !q || JSON.stringify(d).toLowerCase().includes(q)).forEach((d, i) => {
      const div = document.createElement('div');
      div.className = 'item' + (i === 0 ? ' sel' : '');
      div.innerHTML = '<span><span class="dot" style="background:' + colorFor(d.key) + '"></span>' + d.key + '</span>'
        + '<span class="meta">' + (d.cadence || '—') + '</span>';
      div.onclick = () => {
        flows.querySelectorAll('.item').forEach((x) => x.classList.remove('sel'));
        div.classList.add('sel');
        paintDetail(d);
      };
      flows.appendChild(div);
    });
  };
  const paintDetail = (d) => {
    detail.innerHTML = '<div class="decision"><h3>' + d.key + '</h3>'
      + '<p class="muted">source: ' + d.source + ' · cadence: ' + (d.cadence || '—') + '</p>'
      + (d.owner ? '<p><b>True owner:</b> ' + d.owner + '</p>' : '')
      + (d.cadenceNote ? '<p class="muted">' + d.cadenceNote + '</p>' : '')
      + (d.scheduledFrom ? '<p><b>Scheduled from:</b> ' + d.scheduledFrom + '</p>' : '')
      + (d.writes && d.writes.length ? '<p><b>May write:</b> ' + d.writes.map((w) => '<span class="chip">' + w + '</span>').join('') + '</p>' : '')
      + (d.testFile ? '<p><b>Tests:</b> ' + d.testFile + '</p>' : '')
      + '</div>'
      + '<h2>Entry functions (' + d.entryFunctions.length + ')</h2><table>'
      + d.entryFunctions.map((name) => {
          const idx = data.functions.findIndex((f) => f.name === name);
          return '<tr><td><a href="#" data-go="' + idx + '">' + name + '</a></td><td class="muted">'
            + (idx >= 0 ? short(data.functions[idx].file) : '') + '</td></tr>';
        }).join('') + '</table>'
      + '<h2>Owner modules</h2><p>' + d.modules.map((m) => '<span class="chip">' + m + '</span>').join('') + '</p>';
    detail.querySelectorAll('[data-go]').forEach((a) => {
      a.onclick = (event) => {
        event.preventDefault();
        const idx = Number(a.dataset.go);
        if (idx < 0) return;
        history.push(selected);
        showTab('fns');
        select(idx);
      };
    });
  };
  paint('');
  $('flowSearch').oninput = (event) => paint(event.target.value);
  if (rows.length) paintDetail(rows[0]);
}

// --- modules view -----------------------------------------------------------------------------
function renderModules() {
  const list = $('modList');
  const detail = $('modDetail');
  const byFile = new Map();
  data.functions.forEach((f, i) => {
    const entry = byFile.get(f.file) ?? { file: f.file, fns: [], owners: new Set() };
    entry.fns.push({ f, i });
    if (f.ownerKey) entry.owners.add(f.ownerKey);
    byFile.set(f.file, entry);
  });
  const modules = [...byFile.values()].sort((a, b) => b.fns.length - a.fns.length);
  list.innerHTML = '<input type="search" id="modSearch" placeholder="filter modules…" /><div id="mods"></div>';
  const mods = $('mods');
  const paintList = (filter) => {
    const q = (filter || '').toLowerCase();
    mods.innerHTML = '';
    modules.filter((m) => !q || m.file.toLowerCase().includes(q)).slice(0, 400).forEach((m, i) => {
      const div = document.createElement('div');
      div.className = 'item' + (i === 0 ? ' sel' : '');
      div.innerHTML = '<span>' + short(m.file) + '</span><span class="meta">' + m.fns.length + ' fns</span>';
      div.onclick = () => {
        mods.querySelectorAll('.item').forEach((x) => x.classList.remove('sel'));
        div.classList.add('sel');
        paintDetail(m);
      };
      mods.appendChild(div);
    });
  };
  const paintDetail = (m) => {
    const inbound = new Map();
    const outbound = new Map();
    for (const { f, i } of m.fns) {
      for (const c of f.callers) {
        const key = data.functions[c.index].file;
        if (key !== m.file) inbound.set(key, (inbound.get(key) ?? 0) + 1);
      }
      for (const c of f.callees) {
        const key = data.functions[c.index].file;
        if (key !== m.file) outbound.set(key, (outbound.get(key) ?? 0) + 1);
      }
    }
    const rows = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])
      .map(([file, n]) => '<tr><td>' + short(file) + '</td><td class="muted">' + n + '</td></tr>').join('');
    detail.innerHTML = '<h2>' + m.file + '</h2>'
      + '<p class="muted">' + m.fns.length + ' functions · owner(s): '
      + ([...m.owners].map((o) => '<span class="chip">' + o + '</span>').join('') || '—') + '</p>'
      + '<h2>Functions</h2><table>'
      + m.fns.sort((a, b) => (b.f.callers.length + b.f.callees.length) - (a.f.callers.length + a.f.callees.length))
          .map(({ f, i }) => '<tr><td><a href="#" data-go="' + i + '">' + f.name + '</a></td>'
            + '<td class="muted">' + f.callers.length + '←' + f.callees.length + '→</td></tr>').join('')
      + '</table>'
      + '<h2>Called from other modules</h2><table>' + rows(inbound) + '</table>'
      + '<h2>Calls into other modules</h2><table>' + rows(outbound) + '</table>';
    detail.querySelectorAll('[data-go]').forEach((a) => {
      a.onclick = (event) => { event.preventDefault(); history.push(selected); showTab('fns'); select(Number(a.dataset.go)); };
    });
  };
  paintList('');
  $('modSearch').oninput = (event) => paintList(event.target.value);
  if (modules.length) paintDetail(modules[0]);
}

function showTab(which) {
  for (const [id, main] of [['tabFlow', 'viewFlow'], ['tabFns', 'viewFns'], ['tabMods', 'viewMods']]) {
    $(id).classList.toggle('active', id === 'tab' + which[0].toUpperCase() + which.slice(1));
    $(main).classList.toggle('active', main === 'view' + which[0].toUpperCase() + which.slice(1));
  }
  if (which === 'fns') setTimeout(() => select(selected), 0);
}
$('tabFlow').onclick = () => showTab('flow');
$('tabFns').onclick = () => showTab('fns');
$('tabMods').onclick = () => showTab('mods');
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && history.length) { select(history.pop()); }
});

renderFlow();
renderModules();
select(selected);
</script>
</body>
</html>
`;
}

if (process.env.CALLGRAPH_LIB !== '1') main();
