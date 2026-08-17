/** Short searchable help topics for More → Guide. */

export interface GuideHelpTopic {
  id: string;
  title: string;
  /** Words players might type */
  keywords: string;
  body: string;
}

export const GUIDE_HELP_TOPICS: GuideHelpTopic[] = [
  {
    id: 'forge',
    title: 'Blacksmith forge',
    keywords: 'forge blacksmith smith iron swords spears shields scale mail make craft gear weapons armor',
    body: 'Research unlocks an order → staff Blacksmith → queue once → wait until done. Each order is a village upgrade, not a pile of items. You do not forge one sword per person.',
  },
  {
    id: 'swords',
    title: 'Iron swords (tiers)',
    keywords: 'swords weapon tier spears iron_swords how many',
    body: 'Swords are a weapon tier, not a stockpile. Path: forge Iron Spears first, then research + forge Iron Swords once. Higher tier replaces lower for all adults.',
  },
  {
    id: 'militia',
    title: 'Who fights / barracks',
    keywords: 'militia raid strength barracks guard defend armament army',
    body: 'On raids, all adults fight using the village gear tier. Barracks only add extra strength for staffed Guards (empty barracks do nothing). Walls help Barricade more than open Defend.',
  },
  {
    id: 'raids',
    title: 'Raids',
    keywords: 'raid war rival attack defend barricade tribute march',
    body: 'No battle screen — strength ratios decide the fight. Respond on the banner or Frontier. Outgoing raids cost food; answer the banner or the war-band can stand down.',
  },
  {
    id: 'rivals',
    title: 'Other tribes',
    keywords: 'rival camp visitor tribe neighbor peace friendly tense build expand',
    body: 'Rivals share your map and slowly expand their camp (houses, farms, markets, or towers by mood). Not always hostile. Click a camp for gifts, peace, trade, or raids.',
  },
  {
    id: 'favorite',
    title: 'Favorite citizen',
    keywords: 'favorite follow star track citizen settler camera',
    body: 'Select a settler → ☆ to favorite. Camera follows them. Families list has ☆ too. One favorite at a time; Stop on the banner clears it.',
  },
  {
    id: 'win',
    title: 'Winning / goals',
    keywords: 'win goals end game how to win',
    body: 'There is no required win. Progress → Goals shows how history sees you (war, nature, trade, build, diplomacy). Challenges are optional rewards.',
  },
  {
    id: 'wildlife',
    title: 'Wildlife / seasons',
    keywords: 'animals wildlife rabbits deer gone winter grass hunt empty',
    body: 'Open Nature (N) — wildlife counts are at the top (rabbits, deer, wolves, foxes, grass). Winter and hunting thin herds; low numbers can rebound on the frontier.',
  },
  {
    id: 'save',
    title: 'Save & load',
    keywords: 'save load file download browser gone lost',
    body: 'Menu → Save to file downloads a .json you keep. Load from file opens it later. Browser Save can vanish if cache is cleared — use the file for real colonies.',
  },
  {
    id: 'bridge',
    title: 'Rivers & bridges',
    keywords: 'river bridge water cross span map',
    body: 'Maps already generate rivers. Build → Infra → Bridge (Fine Construction). Place on river/bank. Sprite is a hand-made seamless wooden deck (regenerate with scripts/generate-bridge-sprite.mjs).',
  },
  {
    id: 'pregnant',
    title: 'Pregnancy',
    keywords: 'pregnant baby birth expecting mother hospital',
    body: 'Married couples near home can conceive (~24 days). Mothers keep walking; staffed Hospital helps. Rare wildkin births near deer. No sibling check yet.',
  },
];

export function searchGuideHelp(query: string, limit = 6): GuideHelpTopic[] {
  const q = query.trim().toLowerCase();
  if (!q) return GUIDE_HELP_TOPICS;
  const terms = q.split(/\s+/).filter(Boolean);
  return GUIDE_HELP_TOPICS
    .map((t) => {
      const hay = `${t.title} ${t.keywords} ${t.body}`.toLowerCase();
      let score = 0;
      for (const term of terms) {
        if (hay.includes(term)) score += 1;
        if (t.title.toLowerCase().includes(term)) score += 2;
      }
      return { t, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.t);
}
