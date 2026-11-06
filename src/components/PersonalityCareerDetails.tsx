/**
 * Read-only inspector: the fourteen inherited aptitudes, derived highlights, the same activity
 * factors the simulation uses, and witnessed career records. Nothing here is recalculated or written.
 */
import { JOB_LABELS, JobType, type Entity } from '../game/gameTypes';
import { APTITUDE_DEFS, APTITUDE_IDS, expressAptitudes, type GeneticAptitude } from '../game/settlerTraits';
import { PERSONAL_MARK_DEFS, marksOf } from '../game/personalMarks';
import { evaluateAllAptitudeActivities } from '../game/personality/traitEvaluation';
import { CAREER_TIER_DAYS, CAREER_TIER_LABELS } from '../game/careers/careerProgression';
import { evaluateWorkerFit } from '../game/careers/workerFit';
import { isPlayerHuman } from '../game/playerHuman';

/** Canonical job order for career rows; `settler` is the absence of a trade, not a row. */
const CAREER_JOB_ORDER: readonly JobType[] = (Object.values(JobType) as JobType[])
  .filter((job) => job !== JobType.Settler);

/** Below this relative factor the activity is shown as neutral and omitted from the list. */
const VISIBLE_ACTIVITY_DELTA = 0.01;
const HIGHLIGHT_COUNT = 3;

interface Highlight {
  readonly id: GeneticAptitude;
  readonly relative: number;
}

function strongest(relative: readonly number[], sign: 1 | -1): Highlight[] {
  const entries: Highlight[] = relative
    .map((value, index) => ({ id: APTITUDE_IDS[index], relative: value }))
    .filter((entry) => sign === 1 ? entry.relative > 0 : entry.relative < 0)
    .sort((a, b) => Math.abs(b.relative) - Math.abs(a.relative));
  return entries.slice(0, HIGHLIGHT_COUNT);
}

export default function PersonalityCareerDetails({ entity }: { entity: Entity }) {
  // Living player settlers only: transforms, visitors, captives and the dead carry no such record here.
  if (!entity.alive || !isPlayerHuman(entity)) return null;

  const genome = entity.genomeV2;
  const marks = marksOf(entity);
  const expression = genome ? expressAptitudes(genome) : null;
  const highlights = expression
    ? [...strongest(expression.relative, 1), ...strongest(expression.relative, -1)]
    : [];
  const activities = genome
    ? evaluateAllAptitudeActivities(entity).filter((result) => Math.abs(result.factor - 1) >= VISIBLE_ACTIVITY_DELTA)
    : [];
  const fitJob = entity.job !== undefined && entity.job !== JobType.Settler ? entity.job : null;
  const fit = fitJob === null ? null : evaluateWorkerFit(entity, fitJob, true);
  const careerJobs = CAREER_JOB_ORDER.filter((job) =>
    (entity.skills?.[job] ?? 0) > 0
    || entity.careerHistory?.[job] !== undefined
    || entity.careerMilestones?.[job] !== undefined);

  return (
    <div className="mt-2 rounded-lg border border-violet-700/40 bg-violet-950/25 p-2 text-[10px] text-violet-100">
      <p className="mb-1 font-semibold uppercase tracking-wider text-violet-300">Personality and career</p>

      {expression ? (
        <>
          <div className="rounded bg-stone-900/40 px-1.5 py-1">
            <p className="font-semibold text-amber-100">Inherited aptitudes</p>
            <ul className="mt-0.5 grid grid-cols-2 gap-x-2">
              {APTITUDE_IDS.map((id, index) => (
                <li key={id} className="truncate text-stone-300" title={APTITUDE_DEFS[id].high}>
                  {APTITUDE_DEFS[id].label}
                  <span className="float-right text-stone-400">{Math.round(expression.raw[index])}</span>
                </li>
              ))}
            </ul>
            <p className="mt-0.5 text-[9px] text-stone-400">
              Personal baseline {expression.mean.toFixed(0)}; each activity below uses both the raw value
              and this settler&apos;s own average.
            </p>
          </div>

          {highlights.length > 0 && (
            <div className="mt-1 rounded bg-stone-900/40 px-1.5 py-1">
              <p className="font-semibold text-amber-100">Most distinctive</p>
              {highlights.map((highlight) => {
                const def = APTITUDE_DEFS[highlight.id];
                const good = highlight.relative > 0;
                return (
                  <p key={highlight.id} className={good ? 'text-emerald-300' : 'text-rose-300'}>
                    {good ? '＋' : '−'} {def.label}: {good ? def.high : def.low}
                  </p>
                );
              })}
            </div>
          )}

          <div className="mt-1 rounded bg-stone-900/40 px-1.5 py-1">
            <p className="font-semibold text-amber-100">Activity effect</p>
            {activities.length > 0 ? (
              <ul className="space-y-0.5">
                {activities.map((result) => {
                  const cost = result.activity === 'conflict';
                  const good = cost ? result.factor < 1 : result.factor > 1;
                  const pct = Math.round((result.factor - 1) * 100);
                  return (
                    <li key={result.activity} className={good ? 'text-emerald-300' : 'text-rose-300'}>
                      {good ? '＋' : '−'} {result.label} ×{result.factor.toFixed(2)} ({pct > 0 ? '+' : ''}{pct}%)
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-stone-400">No meaningful aptitude effect on a supported activity.</p>
            )}
          </div>
        </>
      ) : (
        <p className="text-stone-400">No inherited genome recorded.</p>
      )}

      {marks.length > 0 && (
        <div className="mt-1 rounded bg-stone-900/40 px-1.5 py-1">
          <p className="font-semibold text-amber-100">Personal marks</p>
          {marks.map((mark) => {
            const def = PERSONAL_MARK_DEFS[mark.id];
            return (
              <p key={mark.id} className="text-stone-300">
                <span className={def.born ? 'text-sky-300' : 'text-emerald-300'}>{def.label}</span>
                {' — '}{def.blurb}
                {def.born ? ' · from birth' : ` · day ${mark.day}`}
              </p>
            );
          })}
          <p className="mt-0.5 text-[9px] text-stone-400">
            Marks are personal, not inherited, and feed the same activity factors as aptitudes.
          </p>
        </div>
      )}

      {fitJob !== null && fit !== null && (
        <div className="mt-1 rounded bg-stone-900/40 px-1.5 py-1">
          <p className="font-semibold text-amber-100">Potential job fit — {JOB_LABELS[fitJob]}</p>
          <p className="text-stone-300">
            Skill {Math.round(fit.skill)}/100 · {fit.creditedDays.toLocaleString()} credited day{fit.creditedDays === 1 ? '' : 's'} · aptitude ×{fit.aptitudeFactor.toFixed(2)}
          </p>
          {fit.reasons && fit.reasons.length > 0 ? (
            <ul className="mt-0.5 space-y-0.5">
              {fit.reasons.map((reason) => {
                const def = APTITUDE_DEFS[reason.aptitude];
                const wording = reason.relative > 0 ? def.high : def.low;
                return (
                  <li key={reason.effectId} className={reason.direction === 'benefit' ? 'text-emerald-300' : 'text-rose-300'}>
                    {reason.direction === 'benefit' ? '＋' : '−'} {def.label}: {wording}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-stone-400">No personality effect on this trade&apos;s production.</p>
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
