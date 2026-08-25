#!/usr/bin/env node
/**
 * Source-integrity guard (2026-08-23 stale-javascript-shadows-typescript).
 *
 * Fails when a generated `.js`/`.mjs` file shadows an authoritative
 * TypeScript module (`.ts`/`.mts`) in `src/` or `scripts/`.
 *
 * Usage: node scripts/check-source-shadow-files.mjs
 */
import fs from 'node:fs';
import path from 'node:path';

const roots = [path.resolve('src'), path.resolve('scripts')];
const problems = [];

for (const root of roots) {
  if (!fs.existsSync(root)) continue;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        walk(full);
        continue;
      }
      const match = /\.(js|mjs)$/.exec(entry.name);
      if (!match) continue;
      const extension = match[1];
      const tsPath = full.slice(0, -(extension.length + 1)) + (extension === 'mjs' ? '.mts' : '.ts');
      if (fs.existsSync(tsPath)) {
        problems.push(`${full} shadows ${tsPath}`);
      }
    }
  };
  walk(root);
}

if (problems.length > 0) {
  console.error(`Source-integrity guard failed — ${problems.length} shadow artifact(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log('Source-integrity guard passed: no .js/.mjs shadow files under src/ or scripts/.');
