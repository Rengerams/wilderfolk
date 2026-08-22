import type { WorldState } from './gameTypes';

export type GuidedCampaignChapterId =
  | 'deer_parliament'
  | 'traveling_theatre'
  | 'wedding_diplomacy'
  | 'apprentice_invention'
  | 'rumour_ledger';

export interface GuidedCampaignChapter {
  id: GuidedCampaignChapterId;
  title: string;
  subtitle: string;
  /** Existing story flag(s) that prove the authored chapter resolved. */
  completionFlags: readonly string[];
  /** Memory tags exposed to the campaign journal after resolution. */
  memoryTags: readonly string[];
}

export interface GuidedCampaignChoiceRecord {
  chapterId: GuidedCampaignChapterId;
  choiceId: string;
  tick: number;
}

export interface GuidedCampaignState {
  /** Separate mode switch; sandbox stories continue regardless of this value. */
  active: boolean;
  completed: boolean;
  currentChapterIndex: number;
  unlockedChapterIds: GuidedCampaignChapterId[];
  completedChapterIds: GuidedCampaignChapterId[];
  memoryTags: string[];
  choices: GuidedCampaignChoiceRecord[];
  startedAtTick: number | null;
  lastTransitionTick: number | null;
}

export const GUIDED_CAMPAIGN_CHAPTERS: readonly GuidedCampaignChapter[] = [
  {
    id: 'deer_parliament',
    title: 'The Deer Parliament',
    subtitle: 'The valley asks what you will protect.',
    completionFlags: ['guided_deer_parliament_resolved', 'deer_parliament_resolved'],
    memoryTags: ['stewardship', 'the-deer-remember'],
  },
  {
    id: 'traveling_theatre',
    title: 'The Traveling Theatre Company',
    subtitle: 'History takes the stage.',
    completionFlags: ['guided_traveling_theatre_resolved', 'theatre_story_resolved'],
    memoryTags: ['public-memory', 'the-valley-takes-the-stage'],
  },
  {
    id: 'wedding_diplomacy',
    title: 'The Wedding That Nearly Started a War',
    subtitle: 'A gift can travel farther than an army.',
    completionFlags: ['guided_wedding_diplomacy_resolved', 'wedding_diplomacy_resolved'],
    memoryTags: ['diplomacy', 'old-alliances'],
  },
  {
    id: 'apprentice_invention',
    title: 'The Apprentice’s Terrible Invention Fair',
    subtitle: 'Progress is rarely quiet.',
    completionFlags: ['guided_apprentice_invention_resolved', 'invention_fair_resolved'],
    memoryTags: ['invention', 'bold-apprentices'],
  },
  {
    id: 'rumour_ledger',
    title: 'The Rumour Ledger',
    subtitle: 'The truth survives its retelling.',
    completionFlags: ['guided_rumour_ledger_resolved', 'rumour_ledger_resolved'],
    memoryTags: ['truth', 'remembered-voices'],
  },
] as const;

export function createGuidedCampaignState(): GuidedCampaignState {
  return {
    active: false,
    completed: false,
    currentChapterIndex: 0,
    unlockedChapterIds: [],
    completedChapterIds: [],
    memoryTags: [],
    choices: [],
    startedAtTick: null,
    lastTransitionTick: null,
  };
}

function ensureState(world: WorldState): GuidedCampaignState {
  world.guidedCampaign ??= createGuidedCampaignState();
  return world.guidedCampaign;
}

function hasAnyFlag(world: WorldState, flags: readonly string[]): boolean {
  return flags.some((flag) => (world.storyFlags?.[flag] ?? 0) > 0);
}

function chapterIsCompleted(world: WorldState, chapter: GuidedCampaignChapter): boolean {
  return hasAnyFlag(world, chapter.completionFlags);
}

function addUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

/** Begin only the separate guided mode; this does not disable sandbox stories. */
export function startGuidedCampaign(world: WorldState): void {
  const campaign = ensureState(world);
  if (campaign.active || campaign.completed) return;
  campaign.active = true;
  campaign.startedAtTick = world.tick;
  campaign.lastTransitionTick = world.tick;
  const first = GUIDED_CAMPAIGN_CHAPTERS[0];
  if (first) addUnique(campaign.unlockedChapterIds, first.id);
}

/** Record a campaign choice without applying simulation effects in the UI layer. */
export function recordGuidedCampaignChoice(
  world: WorldState,
  chapterId: GuidedCampaignChapterId,
  choiceId: string,
): void {
  const campaign = ensureState(world);
  if (!campaign.active || campaign.completed) return;
  if (!GUIDED_CAMPAIGN_CHAPTERS.some((chapter) => chapter.id === chapterId)) return;
  if (!campaign.unlockedChapterIds.includes(chapterId)) return;
  campaign.choices.push({ chapterId, choiceId, tick: world.tick });
}

/**
 * Daily-boundary director. It only observes existing story flags and advances the
 * campaign journal; individual story systems remain responsible for all effects.
 */
export function tickGuidedCampaign(world: WorldState): void {
  const campaign = ensureState(world);
  if (!campaign.active || campaign.completed) return;

  for (let index = 0; index < GUIDED_CAMPAIGN_CHAPTERS.length; index += 1) {
    const chapter = GUIDED_CAMPAIGN_CHAPTERS[index];
    if (!chapter || !chapterIsCompleted(world, chapter)) continue;
    addUnique(campaign.completedChapterIds, chapter.id);
    for (const tag of chapter.memoryTags) addUnique(campaign.memoryTags, tag);
    const next = GUIDED_CAMPAIGN_CHAPTERS[index + 1];
    if (next) addUnique(campaign.unlockedChapterIds, next.id);
  }

  const nextIndex = GUIDED_CAMPAIGN_CHAPTERS.findIndex(
    (chapter) => !campaign.completedChapterIds.includes(chapter.id),
  );
  if (nextIndex === -1) {
    campaign.currentChapterIndex = GUIDED_CAMPAIGN_CHAPTERS.length;
    campaign.completed = true;
    campaign.lastTransitionTick = world.tick;
    return;
  }

  if (campaign.currentChapterIndex !== nextIndex) {
    campaign.currentChapterIndex = nextIndex;
    campaign.lastTransitionTick = world.tick;
  }
}

export function getCurrentGuidedChapter(
  world: WorldState,
): GuidedCampaignChapter | null {
  const campaign = world.guidedCampaign;
  if (!campaign?.active || campaign.completed) return null;
  return GUIDED_CAMPAIGN_CHAPTERS[campaign.currentChapterIndex] ?? null;
}

export function getGuidedCampaignProgress(world: WorldState): {
  completed: number;
  total: number;
  current: GuidedCampaignChapter | null;
} {
  const campaign = world.guidedCampaign;
  return {
    completed: campaign?.completedChapterIds.length ?? 0,
    total: GUIDED_CAMPAIGN_CHAPTERS.length,
    current: getCurrentGuidedChapter(world),
  };
}
