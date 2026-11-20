import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

mkdirSync('logs', { recursive: true });
const stamp = new Date().toISOString().replaceAll(':', '-');
const log = createWriteStream(`logs/tauri-dev-${stamp}.log`, { flags: 'wx' });
await new Promise((resolve, reject) => log.once('open', resolve).once('error', reject));
const cli = fileURLToPath(import.meta.resolve('@tauri-apps/cli/tauri.js'));
const child = spawn(process.execPath, [cli, 'dev', ...process.argv.slice(2)], {
  stdio: ['inherit', 'pipe', 'pipe'],
});
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
child.stdout.pipe(log, { end: false });
child.stderr.pipe(log, { end: false });
child.on('error', error => {
  console.error(error.message);
  process.exitCode = 1;
});
child.once('close', code => {
  log.end();
  process.exitCode = code ?? 1;
});
