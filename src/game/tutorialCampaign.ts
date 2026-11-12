import type { WorldState } from './gameTypes';
import { Season } from './gameTypes';
import { BuildingType } from './buildings';
import { getSeason } from './simHelpers';

/**
 * First-spring tutorial campaign — a living guide that auto-advances as the player builds and plays.
 * Non-modal and skippable; steps are pure predicates, so the current step is the first incomplete one.
 */
export interface TutorialCampaignStep {
  id: string;
  icon: string;
  title: string;
  detail: string;
  /** True when this step's goal has been met (the guide moves on). */
  isComplete: (world: WorldState) => boolean;
}

const hasCompletedBuilding = (world: WorldState, type: BuildingType): boolean =>
  world.buildings.some((b) => b.completed && b.type === type && b.faction !== 'rival');

const hasAnyStaffedBuilding = (world: WorldState): boolean =>
  world.buildings.some((b) => b.completed && (b.occupants?.length ?? 0) > 0);

export const TUTORIAL_CAMPAIGN: TutorialCampaignStep[] = [
  {
    id: 'build_house',
    icon: '🏠',
    title: 'Build your first House',
    detail: 'Press B (or 1) to open Build → Housing → House, then click open ground near your camp. Everyone needs a roof before the first night.',
    isComplete: (w) => hasCompletedBuilding(w, BuildingType.House),
  },
  {
    id: 'build_farm',
    icon: '🌾',
    title: 'Plant a Farm',
    detail: 'Open Build → Food → Farm and place it on flat ground. Farms feed your settlers — you start with a food stockpile, but mouths grow fast.',
    isComplete: (w) => hasCompletedBuilding(w, BuildingType.Farm),
  },
  {
    id: 'assign_workers',
    icon: '👷',
    title: 'Workers on the job',
    detail: 'Finished buildings staff themselves automatically from idle settlers. Idle settlers eat but produce nothing — a staffed building is a living building.',
    isComplete: hasAnyStaffedBuilding,
  },
  {
    id: 'wood_or_meat',
    icon: '🪵',
    title: 'Secure wood & meat',
    detail: 'Build a Hunting Spot (meat from wildlife) or a Lumber Mill (wood for everything you build). Producing beats saving — your stockpile is small.',
    isComplete: (w) => hasCompletedBuilding(w, BuildingType.HuntingSpot) || hasCompletedBuilding(w, BuildingType.LumberMill),
  },
  {
    id: 'store_gold',
    icon: '🏪',
    title: 'Earn gold',
    detail: 'A Store generates passive gold with one worker. Gold buys research, forge orders, and trade — place one when you can spare a settler.',
    isComplete: (w) => hasCompletedBuilding(w, BuildingType.Store) || hasCompletedBuilding(w, BuildingType.Market),
  },
  {
    id: 'winter_watch',
    icon: '❄️',
    title: 'Prepare for winter',
    detail: 'Settlers burn wood to heat homes each winter day (1 per 5 people). Stockpile wood and keep food production running — a hungry village is a dying village.',
    // Winter begins on day 270; the year check keeps the step finished on every later winter.
    isComplete: (w) => w.year >= 1 || getSeason(w.dayInYear) === Season.Winter,
  },
  {
    id: 'year_two',
    icon: '🎉',
    title: 'Your valley lives on',
    detail: 'Survive to day 360, when the first year turns. Focus hints live in the Daily council, the roster is in People, and the village portrait is in the Progress window. The wild is watching.',
    isComplete: (w) => w.year >= 1,
  },
];

/** Current campaign step — the first incomplete one, or null when done. */
export function currentCampaignStep(world: WorldState): TutorialCampaignStep | null {
  const idx = TUTORIAL_CAMPAIGN.findIndex((s) => !s.isComplete(world));
  return idx === -1 ? null : TUTORIAL_CAMPAIGN[idx];
}