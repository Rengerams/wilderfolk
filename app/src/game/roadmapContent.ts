/** In-game roadmap — one table per version. Dev detail: ../../ROADMAP_0.5.0.md */

export type RoadmapFeatureStatus = 'done' | 'partial' | 'open';

export interface RoadmapFeature {
  label: string;
  status: RoadmapFeatureStatus;
}

export interface RoadmapVersion {
  version: string;
  theme: string;
  shipDate: string;
  tagTarget?: string;
  features: RoadmapFeature[];
}

export const ROADMAP_TARGET_VERSION = '0.5.0';

export const ROADMAP_NORTH_STAR =
  'A cozy frontier eco-sim where settlers live on a schedule, the food chain matters, the valley feels alive with other people and tribes — and you always know what to do next.';

const DONE = (label: string): RoadmapFeature => ({ label, status: 'done' });
const PARTIAL = (label: string): RoadmapFeature => ({ label, status: 'partial' });
const OPEN = (label: string): RoadmapFeature => ({ label, status: 'open' });

/** Newest first. Older versions = done only; v0.5.0 includes open work. */
export const ROADMAP_VERSIONS: RoadmapVersion[] = [
  {
    version: '0.5.0',
    theme: 'Scale + architecture',
    shipDate: '2026-07-05 (in code)',
    tagTarget: 'End July 2026',
    features: [
      DONE(
        'Election & leadership — decennial ceremony (year-before buildup → 3-day Revelry), incumbent always in race with record score (+8 cap), panel + hints + tutorial synced',
      ),
      DONE('Dead-entity compaction — alive-only entities each tick'),
      PARTIAL('Renderer cache — wire sim byType into render snapshot'),
      PARTIAL('buildingById go-home — drop commute .find()'),
      PARTIAL('Grass render spatial buckets'),
      PARTIAL('Benchmark gate — SIM_PROFILE village/town/city + p95 exit'),
      PARTIAL('simulate:20year — full 172800-tick PASS'),
      PARTIAL('Sim regression — simulate-30min exit on fail'),
      PARTIAL('App tab split + memo @ 300 population'),
      OPEN('Spatial grid — graze, hunt, flee, wolf-pack queries'),
      OPEN('Settler count denorm — working/idle on WorldState'),
      OPEN('Incremental entityById — update on birth/death only'),
      OPEN('buildingActions scan cleanup'),
      OPEN('Partner id map for relationship lines'),
      OPEN('Particle / floating-text pooling'),
      OPEN('Web Worker gameTick — sim off main thread'),
      OPEN('OffscreenCanvas layers — terrain vs entities'),
      OPEN('GAME_VERSION 0.5.0 + save migration'),
      OPEN('Big bug checkup after perf refactors'),
      OPEN('Logical invariant checks + full sim battery'),
      OPEN('Manual playtest matrix — large map, 10×'),
      OPEN('Outgoing counter-raid march line + militia sprites'),
      OPEN('Reputation milestone arc UI'),
      OPEN('One visitor multi-step quest chain (Scholars or Nomads)'),
      OPEN('Election Year 10/20 live playtest'),
      OPEN('Footstep / work SFX by surface'),
      OPEN('npm run benchmark:gate — CI wrapper'),
    ],
  },
  {
    version: '0.4.2',
    theme: 'Craft, walls/guards, juice, UI/UX',
    shipDate: '2026-07-05',
    features: [
      DONE('6-tab sidebar, alert strip, map build hotbar, tab hotkeys V/F/N/P/L/M'),
      DONE('Focus Go → actions, Frontier/Progress badges, collapsible inspector'),
      DONE('Blacksmith forge queue — iron spears & shields'),
      DONE('Forge alerts + Open Blacksmith →'),
      DONE('Frontier raid polish — 2–6 day deadline by distance, slower distant march'),
      DONE('Village + Frontier raid respond UI; combat preview hints'),
      DONE('Walls, watchtowers, barracks; guard patrols; combat log + export'),
      DONE('Incoming raid march lines on map'),
      DONE('Header ⭐ reputation badge → Trade'),
      DONE('Simulation perf — throttles, entity maps, wildlifeCounts'),
      DONE('Road / wall / gate rotation (R while placing)'),
      DONE('Night glow, build confetti, camera nudge, intro screen'),
      DONE('10-year balance PASS — town 9/9 gates'),
      DONE('10 external playtests'),
      DONE('~40 bug fixes (July 4 comprehensive pass)'),
      DONE('Worker commute snap (7am/7pm)'),
      DONE('Roads benefit copy in Guide'),
      DONE('Reputation — Village explainer + header ⭐'),
      DONE('Rival diplomacy — peace, raids, preview, show-militia parade'),
      DONE('Visitor tribes — 7 kinds, caravan, refugee negotiate, leader talk'),
      DONE('Spear / militia balance'),
    ],
  },
  {
    version: '0.4.1',
    theme: 'Tribes, raids, victories, leadership',
    shipDate: '2026-07-04',
    features: [
      DONE('Tribe diplomacy v2 — map camp panel, event cards, respond choices'),
      DONE('Frontier raids — defend, barricade, pay off, counter-raid'),
      DONE('Combat preview — distance, provisions, defend & raid forecasts'),
      DONE('Raid balance — home-turf +25%, distance food 22–50🍖'),
      DONE('Peace treaties — sign with rivals; raids blocked at peace'),
      DONE('Visitor leader talk — per-kind rewards at camps'),
      DONE('Visitor trade + refugee negotiate'),
      DONE('Guaranteed first-week visitor (days 4–7)'),
      DONE('Trade Empire + Harmony victories (4 active paths)'),
      DONE('Village leadership — merit elections every 10 years'),
      DONE('Population & families panel'),
      DONE('Challenge progress bars + active 🎯 highlight'),
      DONE('Nature tab grazing pressure warning'),
      DONE('Chronicle export (.txt / .json / .csv)'),
      DONE('Focus panel — what to do next'),
      DONE('Reputation explainer (Village tab)'),
      DONE('Combat status icons on settlers (map)'),
      DONE('Prison + Guard job + prisoner UI'),
      DONE('Building foundation pads (category colors)'),
      DONE('Roads 1.5× walk speed; road_bonus → reputation'),
      DONE('In-game Roadmap tab'),
      DONE('Eco Master yearly tracking'),
    ],
  },
  {
    version: '0.4',
    theme: 'Clarity, chronicle, housing, tutorial',
    shipDate: 'June 2026',
    features: [
      DONE('PNG walk-sheet settlers; Quick Start tutorial'),
      DONE('Terrain-aware placement; seasons, weather, pollution, research'),
      DONE('Food at meals (8am & 6pm); workshop recipes'),
      DONE('Defense research tiers; visitors, rivals, festivals, Moon Howlers'),
      DONE('Eco-Utopia + Great City victories'),
      DONE('Village chronicle + export on save'),
      DONE('Sidebar → 6 tabs; alert strip; map hotbar'),
      DONE('Focus hints; armament checklist'),
      DONE('House expand (+2 slots); demolish always visible'),
      DONE('npm run simulate:30min headless sim'),
    ],
  },
];

export const ROADMAP_STATUS_META: Record<
  RoadmapFeatureStatus,
  { icon: string; label: string; className: string }
> = {
  done: { icon: '🟢', label: 'Done', className: 'text-emerald-400' },
  partial: { icon: '🟡', label: 'In progress', className: 'text-amber-400' },
  open: { icon: '⬜', label: 'Open', className: 'text-stone-400' },
};