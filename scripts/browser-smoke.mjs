#!/usr/bin/env node
/**
 * Wilderfolk browser smoke — the one tier that sees the real game.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every other gate in this repository runs in Node: `vitest` (environment `node`), `tsc`, `oxlint`.
 * None of them can see the two things the roadmap keeps asking for evidence about, because those only
 * exist in a browser: the real canvas renderer with real fonts and a real viewport, and the *rendered*
 * result of the valley. Several recorded defects were pure presentation defects — a child sprite with no
 * alpha channel, a hunting arrow emitted from a building, a map that renders as a void — and no Node
 * assertion can see any of them. A pixel check can.
 *
 * So this harness drives the **built** game in a real browser, walks the real player path
 * (boot → intro → settle → live valley), and gates on what the page actually did: is the ground
 * painted, is the simulation ticking, do the zoom controls work, and was the console quiet.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * It does not replace `vitest`. Simulation truth, ownership, cadence, worker deltas and saves stay in
 * the Node tier, where they are fast and isolated. This tier answers one question: *does the real game
 * boot, render, live, and stay quiet in a real browser?*
 *
 * It also does not carry the P6 viewport/DPI matrix, the panel pass, the settler walk-through, the
 * acceptance checklist or the in-app autoplay pass. The 2026-09-21 reconstruction of the previous
 * harness had those as **uncalled** code (its own header said so), and they depend on authoring work
 * rather than recovery — `docs/plans/browser-testing-evaluation.md` holds the design, and
 * `scripts/autoplay-browser-probe.mjs` is where the bot pass lives. What is here is the part that can
 * gate a commit today.
 *
 * A NOTE ON THE REWRITE (2026-09-24)
 * ---------------------------------
 * The previous file was a partial reconstruction of a harness destroyed by the 2026-09-20 tree revert,
 * and it had been failing on its own flow rather than on the game: it clicked the intro at ~1.2 s, when
 * the intro is a **timed cinematic whose call-to-action is not yet enabled**, and it treated "found a
 * button" as "clicked a button". Every downstream failure in its report — *HUD never appeared*, *no
 * `#camera-zoom-preset` control*, *the simulation is not ticking* — was a cascade of that one step.
 * This version waits for an **enabled** control, and it proves each step from the page rather than
 * assuming it.
 *
 * USAGE
 * -----
 *   node scripts/browser-smoke.mjs                      # serve dist/ on a spare port
 *   node scripts/browser-smoke.mjs --url http://127.0.0.1:4320   # reuse a running server
 *   node scripts/browser-smoke.mjs --headful             # watch it happen
 *   node scripts/browser-smoke.mjs --out tmp/shots       # artifact directory
 *   node scripts/browser-smoke.mjs --baseline <png>      # compare the valley against a baseline
 *   node scripts/browser-smoke.mjs --channel msedge      # a different installed browser
 *   node scripts/browser-smoke.mjs --viewport 1600x900   # the wide pass (slower, see below)
 *
 * **Why the default viewport is 900×600.** A headless browser on a machine with no usable GPU
 * soft-rasterises every canvas path, and this game draws thousands of decor and sprite paths per frame.
 * A CPU profile of one valley frame at 1600×900 put **92 % of main-thread self time in native
 * `fill`/`stroke`/`restore`** — the rasteriser, not JS — with individual frames of 5–6 s, and at that
 * viewport the simulation's own tick counter did not advance inside a 21 s window even with the world
 * resumed. At 900×600 the same build ticks normally (measured: tick 24 → 27 and the HUD clock
 * 08:00 → 09:00 in 21 s). The harness therefore runs where the *game* can be observed, and records the
 * measured frame time so an unusually slow environment is visible in the report instead of looking like
 * a frozen simulation. Per-frame performance is a different tier's job (`npm run test:full-year`,
 * `scripts/perf-seeded-year.mts`); this one asks whether the game boots, renders, lives and stays quiet.
 *
 * Exits 0 only when every gate passed. `report.json` and the screenshots are written to `--out`.
 * The browser is the one already on the machine (`playwright-core`, no bundled download).
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import path from 'node:path';

/* ========================= CLI ========================= */

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const parsed = {
    url: null,
    out: 'tmp/shots',
    headful: false,
    channel: 'chrome',
    viewport: { width: 900, height: 600 },
    baseline: null,
    maxDiff: 0.02,
    timeoutMs: 45000,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--url') parsed.url = argv[++i];
    else if (arg === '--out') parsed.out = argv[++i];
    else if (arg === '--headful') parsed.headful = true;
    else if (arg === '--channel') parsed.channel = argv[++i];
    else if (arg === '--baseline') parsed.baseline = argv[++i];
    else if (arg === '--max-diff') parsed.maxDiff = Number(argv[++i]);
    else if (arg === '--viewport') {
      const [w, h] = String(argv[++i]).split('x').map(Number);
      if (w > 0 && h > 0) parsed.viewport = { width: w, height: h };
    } else if (arg === '--help' || arg === '-h') {
      console.log('usage: node scripts/browser-smoke.mjs [--url URL] [--out DIR] [--headful] [--channel NAME] [--baseline PNG] [--max-diff R] [--viewport WxH]');
      process.exit(0);
    } else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  return parsed;
}

/**
 * Render gates, measured on a passing run of this build (2026-09-24, 1600×900, Chrome, the boot view at
 * 145%). The margins are deliberately wide: they are there to catch "the ground never painted" — a black
 * canvas, a void, a frozen frame — not to freeze the art direction. `distinctColors` was 23 671 and
 * `meanLuma` 88.6 when measured, and the 50% view read 11 068 / 42.1 with 63.8% void around the map slab,
 * which is why the far-zoom gate counts *non-void* pixels instead of brightness.
 */
const GATES = {
  minDistinctColors: 4000,
  minMeanLuma: 45,
  maxDarkRatio: 0.3,
  minNonVoidRatioAtFarZoom: 0.15,
};

/* ========================= REPORT ========================= */

const report = {
  startedAt: new Date().toISOString(),
  url: null,
  viewport: args.viewport,
  browser: null,
  checks: {},
  failures: [],
  consoleErrors: [],
  pageErrors: [],
  failedRequests: [],
  badResponses: [],
  screenshots: [],
};

function record(name, ok, detail) {
  report.checks[name] = { ok, detail };
  if (!ok) report.failures.push(`${name}: ${detail}`);
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
  return ok;
}

/* ========================= SERVER ========================= */

const PORT = 4320;
let serverProcess = null;

async function httpOk(url) {
  try {
    const response = await fetch(url);
    return response.ok;
  } catch {
    return false;
  }
}

/** Serve `dist/` unless a URL was supplied. `vite preview` is the shipped artifact, not the dev server. */
async function ensureServer(url) {
  if (args.url) return url;
  serverProcess = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: process.cwd(),
    shell: true,
    stdio: 'ignore',
  });
  const target = url ?? `http://127.0.0.1:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    if (await httpOk(target)) return target;
    await sleep(500);
  }
  throw new Error(`preview server never answered on ${target}`);
}

function stopServer() {
  if (!serverProcess) return;
  spawn('taskkill', ['/pid', String(serverProcess.pid), '/t', '/f'], { shell: true, stdio: 'ignore' });
  serverProcess.kill();
  serverProcess = null;
}

/* ========================= PAGE HELPERS ========================= */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Click the first **enabled** button whose text matches, from inside the page.
 *
 * Enabled matters: the intro is a timed cinematic and its call-to-action exists in the DOM before it can
 * be used, so a raw `element.click()` on it is a silent no-op. Returns what it clicked, or the buttons it
 * saw, so a failure names the real state of the screen.
 */
async function clickEnabledButton(page, pattern) {
  return page.evaluate((source) => {
    const wanted = new RegExp(source, 'i');
    const buttons = [...document.querySelectorAll('button')];
    const match = buttons.find((b) => wanted.test((b.textContent || '').trim()) && !b.disabled);
    if (!match) {
      return { clicked: false, seen: buttons.map((b) => (b.textContent || '').replace(/\s+/g, ' ').trim()).slice(0, 14) };
    }
    const label = (match.textContent || '').replace(/\s+/g, ' ').trim();
    match.click();
    return { clicked: true, label };
  }, pattern.source);
}

/** Wait until the page body contains a string, or give up. */
async function waitForBodyText(page, text, timeoutMs) {
  try {
    await page.waitForFunction(
      (needle) => (document.body.textContent || '').includes(needle),
      text,
      { timeout: timeoutMs, polling: 250 },
    );
    return true;
  } catch {
    return false;
  }
}

/** The gameplay HUD's landmark: the header clock the player reads, plus the zoom control beside it. */
async function gameplayReady(page) {
  return page.evaluate(() => {
    const header = document.querySelector('header');
    const headerText = header ? (header.textContent || '') : '';
    return /\d{1,2}:\d{2}/.test(headerText) && !!document.getElementById('camera-zoom-preset');
  });
}

async function screenshot(page, name, outDir) {
  const file = path.join(outDir, `${name}.png`);
  // A screenshot on a page with a live animation loop can starve `Page.captureScreenshot`; give it room
  // and one retry rather than failing the run on a timing hiccup.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await page.screenshot({ path: file, timeout: 60000 });
      report.screenshots.push(file);
      return file;
    } catch (error) {
      if (attempt === 1) throw error;
      await sleep(1000);
    }
  }
  return file;
}

/**
 * The HUD's own word for whether the simulation is running: the play/pause control is labelled
 * `Resume simulation` exactly while the world is paused. The guided first-spring overlay pauses the
 * world on purpose, so a liveness check that does not resume is measuring the overlay, not the game.
 *
 * Space is the shipped shortcut ("Pause / speed — Space toggles pause", `GameHeader`), and it is the
 * reliable one: the HUD button's own `aria-label` flipped to "running" while the simulation worker's
 * diagnostics still reported `Paused`, whereas a Space press resumed the world for real (measured:
 * tick 24 → 27).
 */
async function resumeIfPaused(page) {
  const label = () => page.evaluate(() => (document.querySelector('[aria-label="Resume simulation"]') ? 'paused' : 'running'));
  const before = await label();
  if (before === 'running') return { wasPaused: false, resumed: false };
  await page.keyboard.press('Space');
  await sleep(1000);
  let after = await label();
  if (after === 'paused') {
    await page.evaluate(() => document.querySelector('[aria-label="Resume simulation"]')?.click());
    await sleep(500);
    after = await label();
  }
  return { wasPaused: true, resumed: after === 'running', labelAfter: after };
}

/**
 * Sample the largest canvas: how many distinct colours it holds, how bright it is, and how much of it is
 * void. This is the only check that can see "the game is up but the valley never painted".
 */
async function sampleCanvas(page) {
  return page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')];
    if (!canvases.length) return null;
    const map = canvases.reduce((best, c) => (c.width * c.height > best.width * best.height ? c : best));
    const ctx = map.getContext('2d');
    if (!ctx) return null;
    const { width, height } = map;
    const data = ctx.getImageData(0, 0, width, height).data;
    const colors = new Set();
    let lumaSum = 0;
    let samples = 0;
    let dark = 0;
    for (let y = 0; y < height; y += 4) {
      for (let x = 0; x < width; x += 4) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        colors.add((r << 16) | (g << 8) | b);
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        lumaSum += luma;
        samples++;
        if (luma < 20) dark++;
      }
    }
    return {
      canvas: `${width}x${height}`,
      samples,
      distinctColors: colors.size,
      meanLuma: Number((lumaSum / samples).toFixed(1)),
      darkRatio: Number((dark / samples).toFixed(3)),
      nonVoidRatio: Number((1 - dark / samples).toFixed(3)),
    };
  });
}

/* ========================= PNG (baseline diff) ========================= */

/** Decode a non-interlaced 8-bit PNG (colour type 2 or 6) — enough for our own screenshots. */
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8) throw new Error(`unsupported bit depth ${body[8]}`);
      channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
      if (!channels) throw new Error(`unsupported colour type ${body[9]}`);
      if (body[12] !== 0) throw new Error('interlaced PNGs are not supported');
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[y * stride + x - channels] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? out[(y - 1) * stride + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        value += pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      }
      out[y * stride + x] = value & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

/** Fraction of sampled pixels differing by more than `tolerance` between two PNGs of the same size. */
function pngDiffRatio(a, b, tolerance) {
  if (a.width !== b.width || a.height !== b.height) return 1;
  let differing = 0;
  let samples = 0;
  for (let y = 0; y < a.height; y += 4) {
    for (let x = 0; x < a.width; x += 4) {
      const ia = (y * a.width + x) * a.channels;
      const ib = (y * b.width + x) * b.channels;
      const delta = Math.max(
        Math.abs(a.data[ia] - b.data[ib]),
        Math.abs(a.data[ia + 1] - b.data[ib + 1]),
        Math.abs(a.data[ia + 2] - b.data[ib + 2]),
      );
      if (delta > tolerance) differing++;
      samples++;
    }
  }
  return samples ? differing / samples : 0;
}

/* ========================= MAIN ========================= */

let browser = null;

async function main() {
  const outDir = path.resolve(args.out);
  mkdirSync(outDir, { recursive: true });

  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    console.error('playwright-core is not installed. Run: npm i -D playwright-core');
    process.exit(2);
  }

  const url = await ensureServer(args.url);
  report.url = url;

  browser = await chromium.launch({ channel: args.channel, headless: !args.headful });
  report.browser = { channel: args.channel, headless: !args.headful, version: browser.version() };
  const page = await browser.newPage({ viewport: args.viewport });

  // Frame-time recorder, installed before the valley exists so the report can show how fast this
  // environment is actually painting (see the header: a GPU-less headless browser is slow, and a slow
  // environment must not be mistaken for a frozen game).
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      window.__frames.push(Number((now - last).toFixed(0)));
      if (window.__frames.length > 40) window.__frames.shift();
      last = now;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

  // The browser's own complaints. `Media net::ERR_ABORTED` is what an audio element produces when the
  // page is torn down mid-load, so it is reported but not counted as a failure.
  page.on('console', (message) => {
    if (message.type() === 'error') report.consoleErrors.push(message.text().slice(0, 300));
  });
  page.on('pageerror', (error) => report.pageErrors.push(error.message.slice(0, 300)));
  page.on('requestfailed', (request) => {
    const failure = `${request.url().slice(-80)} — ${request.failure()?.errorText ?? 'unknown'}`;
    if (/net::ERR_ABORTED/.test(failure) && request.resourceType() === 'media') return;
    report.failedRequests.push(failure);
  });
  page.on('response', (response) => {
    if (response.status() >= 400) report.badResponses.push(`${response.status()} ${response.url().slice(-80)}`);
  });

  // 1. Boot.
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: args.timeoutMs });
  const canvas = await page.waitForSelector('canvas', { timeout: args.timeoutMs }).catch(() => null);
  record('boot', !!canvas, canvas ? 'canvas present' : 'no canvas after load');
  if (!canvas) return;
  await sleep(1500);
  await screenshot(page, 'intro', outDir);
  report.renderer = await page.evaluate(() => {
    const canvases = [...document.querySelectorAll('canvas')];
    const probe = document.createElement('canvas').getContext('webgl2')
      ? 'webgl2' : document.createElement('canvas').getContext('2d') ? '2d' : 'none';
    return { canvases: canvases.map((c) => `${c.width}x${c.height}`), probe };
  });

  // 2. Intro → settlement screen. The CTA is revealed by the intro timeline, so wait for an *enabled* one.
  let introClick = { clicked: false, label: null };
  for (let attempt = 0; attempt < 30 && !introClick.clicked; attempt++) {
    introClick = await clickEnabledButton(page, /skip intro|choose your land/);
    if (!introClick.clicked) await sleep(1000);
  }
  record('intro', introClick.clicked, introClick.clicked ? `clicked "${introClick.label}"` : `no enabled intro control; saw ${JSON.stringify(introClick.seen)}`);
  if (!introClick.clicked) return;

  const setupReached = await waitForBodyText(page, 'Settle the valley', args.timeoutMs);
  await screenshot(page, 'map-setup', outDir);
  record('mapSetup', setupReached, setupReached ? 'settlement screen reached' : 'settlement screen never appeared');
  if (!setupReached) return;

  // 3. Settle. A save in the browser arms a confirmation first (`MapSetupScreen.requestStart`), so the
  // second click is part of the real flow rather than a failure.
  let settle = await clickEnabledButton(page, /settle the valley/);
  if (!settle.clicked) {
    record('settle', false, `no enabled "Settle the valley"; saw ${JSON.stringify(settle.seen)}`);
    return;
  }
  let ready = await waitForGameplay(page, 15000);
  if (!ready) {
    const confirm = await clickEnabledButton(page, /start anyway|yes, start|confirm/);
    if (confirm.clicked) {
      report.settleConfirmation = confirm.label;
      ready = await waitForGameplay(page, args.timeoutMs);
    }
  }
  record('settle', ready, ready ? 'gameplay HUD live' : 'HUD never appeared after settling');
  await screenshot(page, 'valley-frozen', outDir);
  if (!ready) return;

  // The guided first-spring overlay freezes the sim on purpose, so the liveness step below is
  // meaningless until the card is dismissed *and* the world is actually running. The guide can take a
  // moment to appear, and the resume can land before the simulation worker is ready to accept it — both
  // were observed as a frozen clock — so wait for the card, then settle the run state with retries.
  let tutorial = { clicked: false, label: null };
  for (let attempt = 0; attempt < 10 && !tutorial.clicked; attempt++) {
    tutorial = await clickEnabledButton(page, /^(got it|skip)( →)?$/);
    if (!tutorial.clicked) await sleep(1000);
  }
  report.tutorial = { present: tutorial.clicked, label: tutorial.label ?? null };
  await sleep(1000);
  let resumed = await resumeIfPaused(page);
  if (resumed.wasPaused && !resumed.resumed) {
    await sleep(2500);
    resumed = await resumeIfPaused(page);
  }
  report.simResumed = resumed;
  await sleep(1000);
  await screenshot(page, 'valley', outDir);

  // 4. Did the ground actually paint?
  const bootSample = await sampleCanvas(page);
  const painted = !!bootSample
    && bootSample.distinctColors >= GATES.minDistinctColors
    && bootSample.meanLuma >= GATES.minMeanLuma
    && bootSample.darkRatio <= GATES.maxDarkRatio;
  record('render', painted, bootSample ? JSON.stringify(bootSample) : 'no 2d canvas to sample');
  report.render = bootSample;

  // 5. Is the simulation running? The HUD clock is the player's own evidence, and the window is generous
  // on purpose: a soft-rasterising headless browser paints this valley slowly, so a clock that has not
  // moved in a few seconds is not proof of a frozen world (measured: 6 s was too short, 21 s was not).
  // Two windows are allowed, with a fresh resume between them, because the first resume can land before
  // the simulation worker is ready — observed as "HUD says running, clock never moves".
  const waitForClock = async (windowMs) => {
    const from = await headerText(page);
    let to = from;
    const until = Date.now() + windowMs;
    while (Date.now() < until && to === from) {
      await sleep(2500);
      to = await headerText(page);
    }
    return { from, to, elapsedMs: windowMs - (until - Date.now()) };
  };
  let window1 = await waitForClock(18000);
  if (window1.from === window1.to) {
    const retry = await resumeIfPaused(page);
    report.simResumed = { ...resumed, retry };
    window1 = await waitForClock(18000);
  }
  const pausedAtEnd = await page.evaluate(() => (document.querySelector('[aria-label="Resume simulation"]') ? 'paused' : 'running'));
  record(
    'liveness',
    window1.from !== window1.to && window1.from.length > 0,
    window1.from === window1.to
      ? `clock frozen at "${window1.from.slice(0, 50)}" for ${(window1.elapsedMs / 1000).toFixed(0)}s; run state ${pausedAtEnd}`
      : `clock advanced after ${(window1.elapsedMs / 1000).toFixed(0)}s`,
  );
  report.liveness = { before: window1.from, after: window1.to, advanced: window1.from !== window1.to, elapsedMs: window1.elapsedMs, pausedAtEnd };
  report.frameMs = await page.evaluate(() => {
    const frames = window.__frames ?? [];
    if (!frames.length) return null;
    const sorted = [...frames].sort((a, b) => a - b);
    return { samples: frames.length, median: sorted[Math.floor(sorted.length / 2)], max: sorted[sorted.length - 1] };
  });
  await screenshot(page, 'valley-later', outDir);

  // 6. Far zoom: markers replace sprites below 115%, and the map slab shrinks into the void — so this
  // gate counts non-void pixels rather than brightness.
  const zoomControl = await page.$('#camera-zoom-preset');
  if (!zoomControl) {
    record('farZoom', false, 'no #camera-zoom-preset control');
  } else {
    await page.selectOption('#camera-zoom-preset', '0.5');
    await sleep(2500);
    const live = await page.evaluate(() => document.querySelector('[title="Live zoom"]')?.textContent?.trim() ?? null);
    const farSample = await sampleCanvas(page);
    await screenshot(page, 'valley-far-zoom', outDir);
    const ok = live === '50%' && !!farSample && farSample.nonVoidRatio >= GATES.minNonVoidRatioAtFarZoom;
    record('farZoom', ok, `live ${live ?? 'unknown'}, ${farSample ? `non-void ${farSample.nonVoidRatio}` : 'no sample'}`);
    report.farZoom = { live, sample: farSample };
  }

  // 7. Baseline diff, when one was given. The frozen frame is the comparable one: a live frame moves with
  // wall-clock timing, so two runs differ even from one build.
  if (args.baseline) {
    if (!existsSync(args.baseline)) {
      record('baseline', false, `baseline not found: ${args.baseline}`);
    } else {
      const current = await screenshot(page, 'valley-frozen-current', outDir);
      const ratio = pngDiffRatio(
        decodePng(readFileSync(args.baseline)),
        decodePng(readFileSync(current)),
        12,
      );
      const ok = ratio <= args.maxDiff;
      record('baseline', ok, `diff ${(ratio * 100).toFixed(2)}% (max ${(args.maxDiff * 100).toFixed(2)}%)`);
      report.baseline = { file: args.baseline, diffRatio: ratio, maxDiff: args.maxDiff };
    }
  }

  // 8. Quiet gate last, so it covers every step above.
  if (report.consoleErrors.length) record('console', false, `${report.consoleErrors.length} console error(s): ${report.consoleErrors[0]}`);
  else record('console', true, 'no console errors');
  if (report.pageErrors.length) record('pageErrors', false, `${report.pageErrors.length} page error(s): ${report.pageErrors[0]}`);
  else record('pageErrors', true, 'no uncaught exceptions');
  if (report.failedRequests.length) record('requests', false, `${report.failedRequests.length} failed request(s): ${report.failedRequests[0]}`);
  else record('requests', true, 'no failed requests');
  if (report.badResponses.length) record('responses', false, `${report.badResponses.length} bad response(s): ${report.badResponses[0]}`);
  else record('responses', true, 'no 4xx/5xx responses');
}

async function waitForGameplay(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await gameplayReady(page)) return true;
    await sleep(500);
  }
  return false;
}

async function headerText(page) {
  return page.evaluate(() => {
    const header = document.querySelector('header');
    return header ? (header.textContent || '').replace(/\s+/g, ' ').trim() : '';
  });
}

/* ========================= RUN ========================= */

try {
  await main();
} catch (error) {
  report.failures.push(`harness: ${error.message}`);
  console.error(`\nharness error: ${error.message}`);
} finally {
  report.verdict = report.failures.length === 0 ? 'pass' : 'fail';
  report.finishedAt = new Date().toISOString();
  try {
    writeFileSync(path.join(args.out, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  } catch {
    /* an unwritable artifact directory must not hide the verdict */
  }
  await browser?.close().catch(() => {});
  stopServer();
  console.log(`\nverdict: ${report.verdict}${report.failures.length ? `\n${report.failures.map((f) => `  - ${f}`).join('\n')}` : ''}`);
  console.log(`report: ${path.join(args.out, 'report.json')}`);
  process.exit(report.verdict === 'pass' ? 0 : 1);
}
