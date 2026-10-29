/**
 * Read-only inspector: saved DNA wording, advisory job fit and witnessed career records only.
 * A missing record renders as no recorded work; nothing here is inferred, recalculated or written.
 */
import { JOB_LABELS, JobType, type Entity } from '../game/gameTypes';
import { TRAIT_DEFS } from '../game/settlerTraits';
import { TRAIT_EFFECTS, TRAIT_EFFECTS_BY_ID } from '../game/personality/traitEffectCatalog';
import { CAREER_TIER_DAYS, CAREER_TIER_LABELS } from '../game/careers/careerProgression';
import { evaluateWorkerFit } from '../game/careers/workerFit';
import { isPlayerHuman } from '../game/playerHuman';

/** Canonical job order for career rows; `settler` is the absence of a trade, not a row. */
const CAREER_JOB_ORDER: readonly JobType[] = (Object.values(JobType) as JobType[])
  .filter((job) => job !== JobType.Settler);

export default function PersonalityCareerDetails({ entity }: { entity: Entity }) {
  // Living player settlers only: transforms, visitors, captives and the dead carry no such record here.
  if (!entity.alive || !isPlayerHuman(entity)) return null;

  const traits = entity.traits ?? [];
  const fitJob = entity.job !== undefined && entity.job !== JobType.Settler ? entity.job : null;
  const fit = fitJob === null ? null : evaluateWorkerFit(entity, fitJob, true);
  const careerJobs = CAREER_JOB_ORDER.filter((job) =>
    (entity.skills?.[job] ?? 0) > 0
    || entity.careerHistory?.[job] !== undefined
    || entity.careerMilestones?.[job] !== undefined);

  return (
    <div className="mt-2 rounded-lg border border-violet-700/40 bg-violet-950/25 p-2 text-[10px] text-violet-100">
      <p className="mb-1 font-semibold uppercase tracking-wider text-violet-300">Personality and career</p>

      {traits.length > 0 ? (
        <ul className="space-y-1">
          {traits.map((trait) => {
            const def = TRAIT_DEFS[trait];
            const effects = TRAIT_EFFECTS[trait];
            if (!def || !effects) return null;
            return (
              <li key={trait} className="rounded bg-stone-900/40 px-1.5 py-1">
                <p className="font-semibold text-amber-100" title={def.description}>{def.emoji} {def.label}</p>
                <p className="text-emerald-300">＋ {effects.benefit.label}</p>
                <p className="text-rose-300">− {effects.drawback.label}</p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-stone-400">No saved DNA traits.</p>
      )}

      {fitJob !== null && fit !== null && (
        <div className="mt-1 rounded bg-stone-900/40 px-1.5 py-1">
          <p className="font-semibold text-amber-100">Potential job fit — {JOB_LABELS[fitJob]}</p>
          <p className="text-stone-300">
            Skill {Math.round(fit.skill)}/100 · {fit.creditedDays.toLocaleString()} credited day{fit.creditedDays === 1 ? '' : 's'} · aptitude ×{fit.traitFactor.toFixed(2)}
          </p>
          {fit.reasons && fit.reasons.length > 0 ? (
            <ul className="mt-0.5 space-y-0.5">
              {fit.reasons.map((effectId) => {
                const entry = TRAIT_EFFECTS_BY_ID[effectId];
                if (!entry) return null;
                return (
                  <li key={effectId} className={entry.direction === 'benefit' ? 'text-emerald-300' : 'text-rose-300'}>
                    {entry.direction === 'benefit' ? '＋' : '−'} {TRAIT_DEFS[entry.trait].label}: {entry.label}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-stone-400">No personality effect on this trade's production.</p>
          )}
          <p className="mt-0.5 text-stone-400">
            Advisory only — eligibility and commute rank above aptitude when work is assigned.
          </p>
        </div>
      )}

      <div className="mt-1">
        <p className="font-semibold uppercase tracking-wider text-violet-300">Career</p>
        {careerJobs.length > 0 ? (
          <ul className="mt-0.5 space-y-1">
            {careerJobs.map((job) => {
              const history = entity.careerHistory?.[job];
              const milestone = entity.careerMilestones?.[job];
              const days = history?.days ?? 0;
              return (
                <li key={job} className="rounded bg-stone-900/40 px-1.5 py-1">
                  <p className="font-semibold text-amber-100">
                    {JOB_LABELS[job]} · skill {Math.round(entity.skills?.[job] ?? 0)}/100
                  </p>
                  {days > 0 && history ? (
                    <p className="text-stone-300">
                      {days.toLocaleString()} credited day{days === 1 ? '' : 's'} · last worked colony day {history.lastDay.toLocaleString()}
                    </p>
                  ) : (
                    <p className="text-stone-400">No recorded career days.</p>
                  )}
                  {milestone?.tier !== undefined && milestone.tierAtDay !== undefined && (
                    <p className="text-sky-300">
                      {CAREER_TIER_LABELS[milestone.tier]} — {CAREER_TIER_DAYS[milestone.tier]}+ credited days · reached colony day {milestone.tierAtDay.toLocaleString()}
                    </p>
                  )}
                  {milestone?.trainedAtDay !== undefined && (
                    <p className="text-emerald-300">
                      Apprenticeship completed · colony day {milestone.trainedAtDay.toLocaleString()}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-0.5 text-stone-400">
            No recorded career work yet — credits begin with a first witnessed shift.
          </p>
        )}
      </div>
    </div>
  );
}
