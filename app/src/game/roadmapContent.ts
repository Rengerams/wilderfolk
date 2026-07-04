/** In-game slice of repo-root ROADMAP.md — update when shipping. Plan: ../../ROADMAP_0.5.0.md */

export type RoadmapItemStatus = 'done' | 'partial' | 'open' | 'deferred';

export interface RoadmapItem {
  label: string;
  status: RoadmapItemStatus;
  note?: string;
}

export interface RoadmapSection {
  id: string;
  title: string;
  subtitle?: string;
  items: RoadmapItem[];
}

export const ROADMAP_TARGET_VERSION = '0.5.0';

export const ROADMAP_NORTH_STAR =
  'A cozy frontier eco-sim where settlers live on a schedule, the food chain matters, the valley feels alive with other people and tribes — and you always know what to do next.';

export const ROADMAP_WINNING_MOMENT =
  'I hit 150 people on a large map, opened every sidebar tab at 10×, and the valley still felt alive — no stutter.';

export const ROADMAP_SECTIONS: RoadmapSection[] = [
  {
    id: 'version-chain',
    title: 'Version chain',
    subtitle: '0.4.2 shipped → 0.5.0 (end July 2026) → installer / Steam',
    items: [
      { label: '0.4.1 — Tribes, raids, victories, leadership', status: 'done' },
      { label: '0.4.2 — Craft, walls/guards, juice, UI/UX', status: 'done', note: 'Shipped 2026-07-05' },
      {
        label: '0.5.0 — Scale + architecture',
        status: 'open',
        note: 'Sim perf, UI split, Web Worker, canvas layers — end July 2026',
      },
      { label: '1.0 / Steam — installer release', status: 'deferred', note: 'After v0.5.0' },
    ],
  },
  {
    id: 'shipped-041',
    title: 'Shipped in v0.4.1',
    subtitle: 'Base frontier alpha',
    items: [
      { label: 'Guaranteed first-week visitor (pilgrims or performers)', status: 'done' },
      { label: 'road_bonus → reputation + floating +rep (roads) text', status: 'done' },
      { label: 'Tribe diplomacy v2 — map camp panel, event cards, respond choices', status: 'done' },
      { label: 'Visitor trade at camps + refugee negotiate screen', status: 'done' },
      { label: 'Nature tab grazing pressure warning (deer vs grass)', status: 'done' },
      { label: 'Challenge progress bars + active 🎯 highlight', status: 'done' },
      { label: 'Population & families panel', status: 'done' },
      { label: 'Reputation explainer (Village tab)', status: 'done' },
      { label: 'Focus panel — what to do next', status: 'done' },
      { label: 'Prison + Guard job + prisoner UI', status: 'done' },
      { label: 'Chronicle export (.txt / .json / .csv)', status: 'done' },
      { label: 'Building foundation pads (category colors)', status: 'done' },
      { label: 'Combat status icons on settlers (map)', status: 'done' },
      { label: 'Roads 1.5× walk speed in simulation', status: 'done' },
      { label: 'Frontier raids — defend, barricade, pay off; counter-raid', status: 'done' },
      { label: 'Combat preview — distance, provisions, defend & raid forecasts', status: 'done' },
      { label: 'Raid balance — home-turf +25%, distance food 22–50🍖, gated forecast', status: 'done' },
      { label: 'In-game Roadmap tab', status: 'done' },
      { label: 'Peace treaties — sign with rivals; diplomacy events; raids blocked', status: 'done' },
      { label: 'Visitor leader talk — per-kind rewards at visitor camps', status: 'done' },
      { label: 'Trade Empire + Harmony victories (4 active paths)', status: 'done' },
      { label: 'Village leadership — merit elections every 10 years', status: 'done' },
    ],
  },
  {
    id: 'shipped-042',
    title: 'Shipped in v0.4.2',
    subtitle: 'GAME_VERSION 0.4.2 · July 5, 2026',
    items: [
      { label: 'UI/UX — 6-tab sidebar, alert strip, map build hotbar, tab hotkeys V/F/N/P/L/M', status: 'done' },
      { label: 'Focus Go → actions, Frontier/Progress badges, collapsible inspector', status: 'done' },
      { label: 'Blacksmith forge queue — iron spears & shields after research + staffed smith', status: 'done' },
      { label: 'Forge alerts + Open Blacksmith → (armament checklist, priority alerts)', status: 'done' },
      { label: 'Frontier raid polish — 2–6 day deadline by camp distance, slower distant march', status: 'done' },
      { label: 'Village + Frontier raid respond UI; pay-off vs counter-raid hint in preview', status: 'done' },
      { label: 'Raid prep UX — readiness card, no battle screen (preparation-focused)', status: 'done' },
      { label: 'Header ⭐ reputation badge — click opens Progress → Trade', status: 'done' },
      { label: 'Roads benefit copy — Infra hint in build catalog + Guide', status: 'done' },
      {
        label: 'Simulation perf — throttles, entity maps, wildlife byType, wildlifeCounts',
        status: 'partial',
        note: 'Headless ~1.8 ms/tick avg @ ~550 entities — finishes in v0.5.0',
      },
      { label: 'Walls, Watchtowers, Barracks — barricade & militia bonuses', status: 'done' },
      { label: 'Barracks guard patrols around village core (work hours)', status: 'done' },
      { label: 'Combat log panel — Log → Combat sub-tab with export', status: 'done' },
      { label: 'Raid march lines on map (pending incoming raids)', status: 'done' },
      { label: 'Road / wall / gate rotation (R while placing)', status: 'done' },
      { label: 'Juice — night glow, build confetti, camera nudge (toggle in ☰ menu)', status: 'done' },
      { label: 'Intro screen refine — ~20s timeline, skip after logo', status: 'done' },
      { label: '10-year balance pass — town PASS 9/9 gates (2026-07-04)', status: 'done' },
      { label: 'Spear / militia balance — iron replaces stone/wooden (militiaBalance.ts)', status: 'done' },
      { label: 'External playtests — 10 power users (TECHNICAL.md playtest report)', status: 'done' },
      { label: 'Eco breakdown + population growth report (beta feedback)', status: 'done' },
      { label: '~40 bug fixes (July 4 comprehensive pass)', status: 'done' },
    ],
  },
  {
    id: 'half-done',
    title: '🟡 Half-done — finish in v0.5.0',
    subtitle: 'Partial features tracked until shipped or deferred post-0.5',
    items: [
      {
        label: 'Perf at 500+ entities',
        status: 'partial',
        note: 'v0.4.2 throttles + maps — spatial grid + compaction + benchmark gate',
      },
      {
        label: 'UI at 150+ population',
        status: 'partial',
        note: 'Partial memo — tab split + settler count denorm',
      },
      {
        label: 'Frontier counter-raid visuals',
        status: 'partial',
        note: 'flashMilitia today — march line + sprites to rival camp (P1)',
      },
      {
        label: 'Reputation arc UI',
        status: 'open',
        note: '⭐ badge + Village explainer — milestone beats (P1)',
      },
      {
        label: 'Visitor quest depth',
        status: 'open',
        note: 'Leader talk shipped — one multi-step chain (P1)',
      },
      {
        label: 'Rival diplomacy',
        status: 'partial',
        note: 'Peace, raids, preview — tactical map battles deferred post-0.5',
      },
    ],
  },
  {
    id: 'v050-p0-sim1',
    title: 'v0.5.0 P0 — Sim Phase 1',
    subtitle: 'Must ship · end July 2026 · p95 < 16 ms/tick @ town profile',
    items: [
      {
        label: 'Spatial grid — graze, hunt, flee, wolf pack neighbor queries',
        status: 'open',
        note: 'spatialGrid.ts + lifeSimulation.ts',
      },
      {
        label: 'Dead-entity compaction — drop alive: false each tick',
        status: 'open',
        note: 'gameEngine.ts + entityById refresh',
      },
      {
        label: 'Renderer cache reuse — consume sim byType buckets',
        status: 'open',
        note: 'renderer.ts updateCachedEntities()',
      },
      {
        label: 'Settler count denorm — working/idle on WorldState',
        status: 'open',
        note: 'No population scans in App.tsx per tick',
      },
      {
        label: 'Benchmark gate — 50 / 100 / 200 human profiles',
        status: 'open',
        note: 'simulate-30min.ts — exit non-zero if p95 over budget',
      },
    ],
  },
  {
    id: 'v050-p0-sim2',
    title: 'v0.5.0 P0 — Sim Phase 2 + UI',
    subtitle: 'Must ship · end July 2026',
    items: [
      { label: 'Incremental entityById — update on birth/death only', status: 'open' },
      { label: 'buildingActions.ts scan cleanup — assign/recruit paths', status: 'open' },
      { label: 'buildingById go-home — drop updatedBuildings.find', status: 'open' },
      { label: 'Grass render spatial buckets + viewport cull', status: 'open' },
      { label: 'Partner id map for relationship lines', status: 'open' },
      { label: 'Particle / floating-text pooling', status: 'open' },
      { label: 'App tab split + memo — Village / Nature / Progress', status: 'open' },
    ],
  },
  {
    id: 'v050-p0-arch',
    title: 'v0.5.0 P0 — Architecture',
    subtitle: 'Must ship · end July 2026',
    items: [
      { label: 'Web Worker gameTick — sim off main thread', status: 'open', note: 'Serializable state contract' },
      { label: 'OffscreenCanvas layers — terrain vs entities', status: 'open' },
      { label: 'Version bump — GAME_VERSION 0.5.0 + save migration', status: 'open' },
    ],
  },
  {
    id: 'v050-p0-qa',
    title: 'v0.5.0 P0 — Bug audit & simulation gates',
    subtitle: 'Must ship · correctness pass before tag (like v0.4.2 July 4 audit)',
    items: [
      {
        label: 'Big bug checkup — full-code audit after perf refactors',
        status: 'open',
        note: 'Frontier, save/load, raids, forge, prison, visitors, eco, UI dead-ends',
      },
      {
        label: 'Logical invariant checks — entity maps, migration, peace vs raids',
        status: 'open',
        note: 'No ghost workers, orphaned raids, negative food/pop',
      },
      {
        label: '20-year simulation gatekeeper — npm run simulate:20year PASS (town)',
        status: 'open',
        note: 'Primary v0.5 ship blocker — 172800 ticks, 20 winters, Y20 pop gate; exit 0 to tag',
      },
      {
        label: 'Headless simulation battery — all scripts green before ship',
        status: 'open',
        note: 'simulate · simulate:30min · simulate:20year · simulate:10year (regression) · balance:militia',
      },
      {
        label: 'Simulation regression gate — exit non-zero on invariant fail',
        status: 'open',
        note: 'Document checks in TECHNICAL.md',
      },
      {
        label: 'Manual playtest matrix — large map, 10×, save/reload, raid/forge/peace',
        status: 'open',
      },
    ],
  },
  {
    id: 'v050-p1',
    title: 'v0.5.0 P1 — Polish & content',
    subtitle: 'Should ship with scale milestone',
    items: [
      {
        label: 'Counter-raid militia march — line + sprites to rival camp',
        status: 'open',
        note: 'Abstract resolve stays — prep-focused combat',
      },
      {
        label: 'Large-map playtests at 10× after benchmark gate green',
        status: 'open',
      },
      {
        label: 'Spear tier balance review — militia preview vs 10-year sims',
        status: 'partial',
        note: 'Validate at city scale',
      },
      {
        label: 'Perf UX — optional dev overlay (ms/tick, entity count, grid rebuild)',
        status: 'open',
      },
      { label: 'Reputation arc UI — milestones beyond ⭐ tooltip', status: 'open' },
      { label: 'Footstep / work SFX by surface', status: 'open' },
      { label: 'One visitor multi-step quest chain (Scholars or Nomads)', status: 'open' },
      { label: 'npm run benchmark:gate — CI-friendly wrapper', status: 'open' },
    ],
  },
  {
    id: 'v050-p2',
    title: 'v0.5.0 P2 — Stretch',
    subtitle: 'Only if P0 green before end July 2026 ship',
    items: [
      { label: 'Adaptive catch-up / sim decimation at 10×', status: 'open' },
      { label: 'Canvas LOD — trees, animals, sprites at low zoom', status: 'open' },
      { label: 'Save-size report in Game menu', status: 'open' },
      { label: 'Perf overlay polish — pool stats, bucket rebuild ms', status: 'open' },
    ],
  },
];

export const ROADMAP_NEXT_ACTIONS: string[] = [
  'v0.5.0 — Add spatialGrid.ts + wire flee/hunt (USE_SPATIAL_GRID flag)',
  'v0.5.0 — Dead-entity compaction + renderer cache + villageCounts denorm',
  'v0.5.0 — simulate-30min profiles: village / town / city + p95 exit code',
  'v0.5.0 — Incremental entityById; buildingActions + go-home cleanup',
  'v0.5.0 — Grass buckets, partner map, particle pooling, App tab split',
  'v0.5.0 — Web Worker gameTick + OffscreenCanvas terrain/entity layers',
  'v0.5.0 P1 — Counter-raid march line; large-map playtests; reputation arc',
  'v0.5.0 — npm run simulate:20year PASS (town) — primary ship gatekeeper',
  'v0.5.0 — Big bug checkup + logic invariants + full headless sim battery',
  'v0.5.0 — Bump GAME_VERSION to 0.5.0 + migration + CHANGELOG + tag',
];

/** Open fixes — all remaining work targets v0.5.0 */
export const ROADMAP_OPEN_FIXES: string[] = [
  'P0 — spatial grid for graze/hunt/flee at 100+ entities',
  'P0 — dead-entity compaction + renderer cache reuse + benchmark gate',
  'P0 — incremental entityById, buildingActions scans, App tab split, pooling',
  'P0 — Web Worker gameTick + OffscreenCanvas layers',
  'P0 — big bug checkup after perf refactors (frontier, save, raids, forge, eco)',
  'P0 — simulate:20year PASS (town) — primary gatekeeper before v0.5 tag',
  'P0 — logical invariant checks + headless sim battery (5min, 30min, 10year regression, militia)',
  'P1 — counter-raid militia march visuals (prep-focused; no battle screen)',
  'P1 — large-map playtests at 10×; reputation arc; visitor quest chain',
  'P1 — footstep SFX; npm run benchmark:gate CI wrapper',
  'Event log uncapped in saves by design — full chronicle kept forever',
];

export const ROADMAP_DEFERRED: string[] = [
  'Real-time tactical map battles — abstract raids stay (post-0.5.0)',
  'Installer / Steam release — no Node.js (post-0.5.0)',
  'Full tribal wars, sieges, embassies, player caravans',
  'Leader perks / government decisions beyond ceremonial head',
  'Fog of war / map expansion scouts',
  'Hospital disease loop, wardogs, deep festival/culture',
  'Multiplayer',
];