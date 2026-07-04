/** In-game slice of repo-root ROADMAP.md — update when shipping. Plans: ../../ROADMAP_0.4.3.md · ../../ROADMAP_0.4.4.md */

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

export const ROADMAP_TARGET_VERSION = '0.4.3';

export const ROADMAP_NORTH_STAR =
  'A cozy frontier eco-sim where settlers live on a schedule, the food chain matters, the valley feels alive with other people and tribes — and you always know what to do next.';

export const ROADMAP_WINNING_MOMENT =
  'I built a house, assigned workers, met a neighbor tribe, armed my village, and everyone came home at night.';

export const ROADMAP_SECTIONS: RoadmapSection[] = [
  {
    id: 'version-chain',
    title: 'Version chain',
    subtitle: '0.4.2 shipped → 0.4.3 (Sep 2026) → 0.4.4 (Nov 2026) → 0.5.0 (Q1 2027)',
    items: [
      { label: '0.4.1 — Tribes, raids, victories, leadership', status: 'done' },
      { label: '0.4.2 — Craft, walls/guards, juice, UI/UX', status: 'done', note: 'Shipped Jul 2026' },
      { label: '0.4.3 — Scale & perf Phase 1', status: 'open', note: 'Spatial grid, compaction, benchmark gate' },
      { label: '0.4.4 — Perf Phase 2 + App tab split', status: 'deferred', note: 'Nov 2026' },
      { label: '0.5.0 — Web Worker gameTick + canvas layers', status: 'deferred', note: 'Q1 2027' },
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
        note: 'Headless ~1.8 ms/tick avg @ ~550 entities — Phase 1 finishes in v0.4.3',
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
      { label: 'External playtests — 10 power users (PLAYTEST_BETA_10_USERS.md)', status: 'done' },
      { label: 'Eco breakdown + population growth report (beta feedback)', status: 'done' },
      { label: '~40 bug fixes (July 4 comprehensive pass)', status: 'done' },
    ],
  },
  {
    id: 'half-done',
    title: '🟡 Half-done registry',
    subtitle: 'Partial features tracked until finished or deferred',
    items: [
      {
        label: 'Perf at 500+ entities',
        status: 'partial',
        note: 'v0.4.2 throttles + maps — spatial grid + compaction + gate → v0.4.3',
      },
      {
        label: 'Frontier counter-raid visuals',
        status: 'partial',
        note: 'flashMilitia + float text — march line + sprites to rival camp → v0.4.3 P1',
      },
      { label: '10-year balance', status: 'done', note: 'Town PASS 2026-07-04' },
      {
        label: 'Reputation arc UI',
        status: 'deferred',
        note: '⭐ badge + Village explainer — milestone beats → v0.4.4 P1',
      },
      {
        label: 'Rival diplomacy',
        status: 'partial',
        note: 'Peace, raids, preview, march lines — tactical map battles deferred',
      },
      {
        label: 'Visitor tribes',
        status: 'partial',
        note: '7 kinds, leader talk — deeper per-kind quest chains → v0.4.4',
      },
    ],
  },
  {
    id: 'top10',
    title: 'Top 10 feature tracks',
    subtitle: 'High-level status from ROADMAP.md',
    items: [
      { label: 'Defense & combat — raids, walls, forge, combat log', status: 'done', note: 'Tactical map battles deferred' },
      { label: 'Health & medicine — hospital rep boost only', status: 'deferred', note: 'Disease loop post-0.4.x' },
      { label: 'Farming overhaul — flat daily farms today', status: 'deferred' },
      { label: 'Production & crafting — workshop + Blacksmith forge queue', status: 'done' },
      { label: 'Skills & apprentices — job skills shipped', status: 'partial' },
      { label: 'Diplomacy & tribes — visitors, rivals, peace, leader talk', status: 'done', note: 'Player caravans later' },
      { label: 'Map expansion — sizes/presets today', status: 'deferred', note: 'Fog of war / scouts later' },
      { label: 'Wildlife ecology — food chain + Nature pressure warning', status: 'partial' },
      { label: 'Culture & events — church, festivals, Renffr', status: 'partial' },
      { label: 'Victory & endgame — 4 paths, challenges, chronicle, roadmap tab', status: 'done' },
    ],
  },
  {
    id: 'v043-p0',
    title: 'v0.4.3 P0 — Perf Phase 1',
    subtitle: 'Must ship · Sep 2026 · p95 < 16 ms/tick @ ~700 entities',
    items: [
      {
        label: 'Spatial grid — graze, hunt, flee, wolf pack neighbor queries',
        status: 'open',
        note: 'lifeSimulation.ts — no full-map scans per entity',
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
      {
        label: 'Version bump — GAME_VERSION 0.4.3 + save migration',
        status: 'open',
      },
    ],
  },
  {
    id: 'v043-p1',
    title: 'v0.4.3 P1 — Polish',
    subtitle: 'Should ship with perf milestone',
    items: [
      { label: '10-year balance pass', status: 'done', note: 'Done in v0.4.2 — town PASS 9/9 gates' },
      {
        label: 'External playtests on large map + 10× after benchmark green',
        status: 'open',
      },
      {
        label: 'Counter-raid militia march — line + sprites to rival camp',
        status: 'open',
        note: 'Abstract resolve stays — prep-focused combat',
      },
      {
        label: 'Spear tier balance review — militia preview vs 10-year sims',
        status: 'partial',
        note: 'Iron replaces stone — validate after large-map playtests',
      },
      {
        label: 'Perf UX — optional dev overlay (ms/tick, entity count, grid rebuild)',
        status: 'open',
      },
    ],
  },
  {
    id: 'v043-p2',
    title: 'v0.4.3 P2 — Stretch',
    subtitle: 'Only if P0 green by mid-August 2026',
    items: [
      { label: 'Footstep / work SFX by surface', status: 'deferred', note: 'Deferred from v0.4.2 juice pass → v0.4.4 P1' },
      { label: 'One visitor kind quest depth (e.g. Traders escort)', status: 'deferred', note: '→ v0.4.4 P1' },
      { label: 'npm run benchmark:gate CI wrapper', status: 'deferred' },
      { label: 'Large-map grass render LOD (light buckets)', status: 'deferred', note: 'Full buckets → v0.4.4' },
    ],
  },
  {
    id: 'v044-p0',
    title: 'v0.4.4 P0 — Perf Phase 2',
    subtitle: 'Must ship · Nov 2026 · after v0.4.3 benchmark gate',
    items: [
      { label: 'Incremental entityById — update on birth/death only', status: 'deferred' },
      { label: 'buildingActions.ts scan cleanup — assign/recruit paths', status: 'deferred' },
      { label: 'buildingById go-home — drop updatedBuildings.find', status: 'deferred' },
      { label: 'Grass render spatial buckets + viewport cull', status: 'deferred' },
      { label: 'Partner id map for relationship lines', status: 'deferred' },
      { label: 'Particle / floating-text pooling', status: 'deferred' },
      { label: 'App tab split + memo — Village / Nature / Progress', status: 'deferred' },
      { label: 'Version bump — GAME_VERSION 0.4.4 + save migration', status: 'deferred' },
    ],
  },
  {
    id: 'v044-p1',
    title: 'v0.4.4 P1 — UX & content',
    subtitle: 'Should ship with maintainability milestone',
    items: [
      { label: 'Reputation arc UI — milestones beyond ⭐ tooltip', status: 'deferred' },
      { label: 'Footstep / work SFX by surface', status: 'deferred' },
      { label: 'One visitor multi-step quest chain (Scholars or Nomads)', status: 'deferred' },
      { label: 'npm run benchmark:gate — CI-friendly wrapper', status: 'deferred' },
      { label: 'Perf overlay polish — pool stats, bucket rebuild ms', status: 'deferred' },
    ],
  },
];

export const ROADMAP_NEXT_ACTIONS: string[] = [
  'v0.4.3 — Add spatialGrid.ts + wire flee/hunt (USE_SPATIAL_GRID flag)',
  'v0.4.3 — Dead-entity compaction in gameTick with entityById rebuild',
  'v0.4.3 — simulate-30min profiles: village / town / city + p95 exit code',
  'v0.4.3 — Renderer consume sim byType; villageCounts denorm on WorldState',
  'v0.4.3 P1 — Counter-raid march line (optional polish; abstract resolve stays)',
  'v0.4.3 — Bump GAME_VERSION to 0.4.3 + migration + CHANGELOG',
  'v0.4.4 (Nov 2026) — Incremental maps, App tab split, grass buckets, pooling',
  'v0.5.0 (Q1 2027) — Web Worker gameTick, OffscreenCanvas terrain/entity layers',
];

/** Open fixes — mirrors app/TODO.md + half-done registry for in-game visibility */
export const ROADMAP_OPEN_FIXES: string[] = [
  'v0.4.3 P0 — spatial grid for graze/hunt/flee at 100+ entities',
  'v0.4.3 P0 — dead-entity compaction + renderer cache reuse + benchmark gate',
  'v0.4.3 P1 — counter-raid militia march visuals (prep-focused; no battle screen)',
  'v0.4.3 P1 — large-map playtests at 10× after benchmark gate is green',
  'v0.4.4 — incremental entityById, buildingActions scans, App tab split',
  'Event log uncapped in saves by design — full chronicle kept forever',
];

export const ROADMAP_DEFERRED: string[] = [
  'Real-time tactical map battles — abstract raids stay (post-0.4.x)',
  'Incremental entityById, grass buckets, App split — v0.4.4 (not v0.4.3)',
  'Web Worker gameTick + OffscreenCanvas layers — v0.5.0',
  'Full tribal wars, sieges, embassies, player caravans',
  'Leader perks / government decisions beyond ceremonial head',
  'Fog of war / map expansion scouts',
  'Hospital disease loop, wardogs, deep festival/culture',
  'Multiplayer',
];