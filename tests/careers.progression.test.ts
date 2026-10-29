import { describe, expect, it } from 'vitest';
import { advanceCareerProgression, normalizeCareerMilestones, CAREER_TIER_DAYS } from '../src/game/careers/careerProgression';
import { JobType } from '../src/game/gameTypes';
import { human } from '../src/test/factories';

describe('career milestone progression', () => {
  it('grants descriptive tiers only when genuine history reaches the threshold', () => {
    const h = human(1);
    expect(advanceCareerProgression(h, JobType.Farmer, 1, 'work')).toBe(false);
    expect(h.careerMilestones).toBeUndefined();
    h.careerHistory = { farmer: { days: CAREER_TIER_DAYS.practiced, lastDay: 15 } };
    expect(advanceCareerProgression(h, JobType.Farmer, 15, 'work')).toBe(true);
    expect(advanceCareerProgression(h, JobType.Farmer, 15, 'work')).toBe(false);
    expect(h.careerMilestones?.farmer?.tier).toBe('practiced');
    h.careerHistory.farmer!.days = CAREER_TIER_DAYS.experienced;
    expect(advanceCareerProgression(h, JobType.Farmer, 60, 'work')).toBe(true);
    h.careerHistory.farmer!.days = CAREER_TIER_DAYS.master;
    expect(advanceCareerProgression(h, JobType.Farmer, 180, 'work')).toBe(true);
    expect(h.careerMilestones?.farmer?.tier).toBe('master');
    expect(h.job).toBe(JobType.Settler);
  });

  it('records actual training completion without manufacturing a worked shift or changing skills', () => {
    const h = human(2, { skills: { doctor: 50 } });
    expect(advanceCareerProgression(h, JobType.Doctor, 12, 'training')).toBe(true);
    expect(advanceCareerProgression(h, JobType.Doctor, 13, 'training')).toBe(false);
    expect(h.careerMilestones?.doctor).toEqual({ trainedAtDay: 12 });
    expect(h.careerHistory).toBeUndefined();
    expect(h.skills).toEqual({ doctor: 50 });
    expect(h.job).toBe(JobType.Settler);
  });

  it('normalizes unsupported or fabricated milestone codes without legacy work history', () => {
    expect(normalizeCareerMilestones({ farmer: { tier: 'master', tierAtDay: 4 } })).toBeUndefined();
    expect(normalizeCareerMilestones({ farmer: { tier: 'master', tierAtDay: 4 } },
      { farmer: { days: 180, lastDay: 180 } })).toEqual({ farmer: { tier: 'master', tierAtDay: 4 } });
    expect(normalizeCareerMilestones({ doctor: { trainedAtDay: 9, tier: 'wizard', tierAtDay: 2 } }))
      .toEqual({ doctor: { trainedAtDay: 9 } });
    expect(normalizeCareerMilestones({ doctor: { trainedAtDay: Infinity } })).toBeUndefined();
  });
});
