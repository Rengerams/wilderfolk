/** In-game roadmap — one table per version. Archive: docs/archive/ROADMAP_0.5.0.md */

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

export const ROADMAP_TARGET_VERSION = '0.5.2';

export const ROADMAP_NORTH_STAR =
  'A cozy frontier eco-sim where settlers live on a schedule, the food chain matters, the valley feels alive with other people and tribes — and you always know what to do next.';

const DONE = (label: string): RoadmapFeature => ({ label, status: 'done' });

/** Newest first. Shipped versions list done work only (positive player-facing story). */
export const ROADMAP_VERSIONS: RoadmapVersion[] = [
  {
    version: '0.5.2',
    theme: 'Game-feel & depth — the valley comes alive',
    shipDate: '2026-08-06',
    features: [
      DONE('Flowing water — seamless shallow/deep sprites, wave bands, shore reflection'),
      DONE('Light & season — warm night light pools, season lerp, ambient particles'),
      DONE('Elections every 2 years — the elected head makes a promise — keeping it pays'),
      DONE('Real visitor trade — gold purses; reputation shifts prices and raid odds'),
      DONE('Traveling smith quest — 20 wood for gold and reputation'),
      DONE('Economy ledger — "Food this day": production vs consumption'),
      DONE('Grid pathfinding — settlers and visitors route around water and mountains'),
      DONE('Click-to-focus notifications · favorite citizen follow · closer zoom'),
      DONE('Keep playing your 0.4 / 0.5.0 / 0.5.1 colony — saves continue'),
    ],
  },
  {
    version: '0.5.1',
    theme: 'Clearer valley — what you see matches how it lives',
    shipDate: '2026-07-30',
    features: [
      DONE('Raid spoils stay grounded — gold hauls no longer run unbounded'),
      DONE('Your war parties read clearly on the map'),
      DONE('When the valley strains, hunters and Nature say so'),
      DONE('Keep playing your 0.4 or 0.5.0 colony — saves continue'),
    ],
  },
  {
    version: '0.5.0',
    theme: 'The valley scales — kin, beasts, and forge-steel',
    shipDate: '2026-07-30',
    features: [
      DONE('Bigger towns stay playable — grids, worker sim, lean entities'),
      DONE('Honest days — moon Howlers, housing, raids, immigration, hunt'),
      DONE('Forge tier 5 — iron swords, scale mail, tower ballistae'),
      DONE('Elections, valley stages, hotel, painted map, rich day clock'),
      DONE('Families stay together · father-first custody · raids that cost lives'),
      DONE('Intro milestone · continue from 0.4'),
    ],
  },
  {
    version: '0.4.2',
    theme: 'Craft, walls/guards, juice, UI/UX',
    shipDate: '2026-07-05',
    features: [
      DONE('6-tab sidebar, alert strip, map build hotbar, tab hotkeys V/F/N/P/L/M'),
      DONE('Focus Go → actions, Frontier/Progress badges, collapsible inspector'),
      DONE('Blacksmith forge — iron spears/shields, pickaxes, halberds, wall plates'),
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
      DONE('Frontier raids — defend, barricade, pay off, raid / counter-raid, rival tribute'),
      DONE('Combat preview — distance, provisions, defend & raid forecasts'),
      DONE('Raid balance — home-turf +25%, distance food 22–50🍖'),
      DONE('Peace treaties — sign with rivals; raids blocked at peace'),
      DONE('Visitor leader talk — per-kind rewards at camps'),
      DONE('Visitor trade + refugee negotiate'),
      DONE('Guaranteed first-week visitor (days 4–7)'),
      DONE('Trade Empire + Harmony victories (4 active paths)'),
      DONE('Village leadership — merit elections every 5 years'),
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