import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const comparator = resolve(fileURLToPath(new URL('./compare-population-colony.mjs', import.meta.url)));

function daySnapshot(day, totalDays, newWorkdays) {
  return {
    day, calendarDay: day, tick: 108 + day * 288,
    humans: 250, housed: 250, workersAssigned: 180, buildings: 140,
    food: 9000, wood: 3000, careerWorkers: totalDays ? 1 : 0,
    creditedDays: totalDays, newCreditsToday: newWorkdays,
    newCreditsByJob: { farmer: newWorkdays },
    creditedByJob: { farmer: totalDays },
    botActions: 1, newBotActionsToday: day === 1 ? 1 : 0,
    botIdleHours: day * 24, invariantErrors: 0,
    averageTickMs: 3.5, p95TickMs: 5,
  };
}

function fixture() {
  const days = [daySnapshot(1, 0, 0), daySnapshot(2, 1, 1)];
  const report = {
    version: 4, scenario: 'producers-virtual-player', seed: 12345, populationTarget: 250,
    days: 2, ticks: 576, ticksPerHour: 12, ticksPerDay: 288, warmup: 12,
    node: process.version, platform: process.platform, arch: process.arch,
    viewportFocus: true, initialPopulation: 250, finalPopulation: 250,
    finalBuildings: 140, botActions: 1, botAttemptHours: 49, botIdleHours: 48,
    botByOperation: { startBuilding: 1 }, careerEventCount: 1, careerWorkers: 1,
    careerByJob: { farmer: 1 }, creditedDays: 1, invariantErrors: 0,
    averageMs: 3.5, averageCpuMs: 3, p50Ms: 3, p95Ms: 5, p99Ms: 7,
    maxMs: 8, averageBotMs: 0.1, ticksPerSecond: 270, daySnapshots: days,
  };
  const logs = [
    { kind: 'start', seed: 12345, population: 250, days: 2 },
    { kind: 'bot-action', tick: 108, op: 'startBuilding', day: 0, hour: 9 },
    { kind: 'daily-summary', ...days[0] },
    {
      kind: 'career-workday', entityId: 72, name: 'Founding Worker', job: 'farmer',
      workplaceId: 15, observedHours: 7.5, lastDay: 1,
      previousDays: 0, totalDays: 1,
    },
    { kind: 'daily-summary', ...days[1] },
    { kind: 'finish', creditedDays: 1 },
  ];
  return { report, logs };
}

function compareWith(report, events) {
  const dir = mkdtempSync(join(tmpdir(), 'wilderfolk-colony-audit-'));
  try {
    const path = join(dir, 'candidate.json');
    const eventPath = join(dir, 'candidate.events.jsonl');
    report.eventLogPath = eventPath;
    writeFileSync(path, JSON.stringify(report));
    writeFileSync(eventPath, events.map(event => JSON.stringify(event)).join('\n') + '\n');
    return execFileSync(process.execPath, [comparator, 'none', path, '250', '2'],
      { encoding: 'utf8', stdio: 'pipe' });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('valid 2-day simulation audit reconciles residents, jobs, bot commands and days', () => {
  const { report, logs } = fixture();
  const result = compareWith(report, logs);
  assert.match(result, /Recorded workdays/);
  assert.match(result, /farmer 1/);
});

test('a career registration without observed work hours fails', () => {
  const { report, logs } = fixture();
  logs[3].observedHours = 0;
  assert.throws(() => compareWith(report, logs), /failed|invalid worker\/job\/site\/hours/i);
});

test('duplicate registered career days for one resident and profession fail', () => {
  const { report, logs } = fixture();
  report.creditedDays = 2;
  report.careerEventCount = 2;
  report.careerByJob.farmer = 2;
  report.daySnapshots[1].newCreditsToday = 2;
  report.daySnapshots[1].newCreditsByJob.farmer = 2;
  report.daySnapshots[1].creditedDays = 2;
  report.daySnapshots[1].creditedByJob.farmer = 2;
  logs[4].newCreditsToday = 2;
  logs[4].newCreditsByJob.farmer = 2;
  logs[4].creditedDays = 2;
  logs[4].creditedByJob.farmer = 2;
  logs.splice(4, 0, { ...logs[3] });
  assert.throws(() => compareWith(report, logs), /failed|duplicate workday/i);
});

test('missing daily career attribution fails even when the overall total matches', () => {
  const { report, logs } = fixture();
  report.daySnapshots[1].newCreditsByJob = { lumberjack: 1 };
  assert.throws(() => compareWith(report, logs), /failed|cumulative professional history/i);
});
