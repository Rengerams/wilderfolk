import { spawn } from 'node:child_process';
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(scriptDir, '..');
const logDir = resolve(projectDir, 'logs');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logPath = resolve(logDir, `tauri-dev-${timestamp}.log`);
const port = Number(process.env.WILDERFOLK_DEV_PORT ?? 5173);

mkdirSync(logDir, { recursive: true });
const log = createWriteStream(logPath, { flags: 'a' });

function writeLine(source, value) {
  const text = String(value).replace(/\r?\n$/, '');
  if (!text) return;
  const line = `[${new Date().toISOString()}] [${source}] ${text}\n`;
  process.stdout.write(line);
  log.write(line);
}

function isPortOpen(portNumber) {
  return new Promise((resolveOpen) => {
    const socket = net.createConnection({ host: '127.0.0.1', port: portNumber });
    socket.once('connect', () => {
      socket.destroy();
      resolveOpen(true);
    });
    socket.once('error', () => resolveOpen(false));
    socket.setTimeout(750, () => {
      socket.destroy();
      resolveOpen(false);
    });
  });
}

function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

const alreadyRunning = await isPortOpen(port);
if (alreadyRunning) {
  writeLine('runner', `Refusing to start: port ${port} is already in use. Reuse the existing Tauri/Vite session.`);
  log.end();
  process.exitCode = 2;
} else {
  writeLine('runner', `Starting one Tauri development session; log file: ${logPath}`);
  writeLine('runner', `Frontend port: ${port}`);

  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(command, ['run', 'tauri:dev', '--', '--verbose'], {
    cwd: projectDir,
    env: { ...process.env, WILDERFOLK_DEV_PORT: String(port) },
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: false,
  });

  child.stdout.on('data', (chunk) => writeLine('tauri', chunk));
  child.stderr.on('data', (chunk) => writeLine('tauri', chunk));
  child.on('error', (error) => writeLine('runner', `Process error: ${error.message}`));
  child.on('exit', (code, signal) => {
    writeLine('runner', `Tauri session ended with code=${code ?? 'null'} signal=${signal ?? 'none'}`);
    log.end();
    process.exitCode = code ?? 1;
  });

  const shutdown = () => {
    writeLine('runner', 'Stopping Tauri session cleanly');
    stopProcess(child);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
