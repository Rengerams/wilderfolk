import type { WorldState } from './gameTypes';
import {
  ELECTION_INTERVAL_YEARS,
  formatSettlerName,
  getElectionCeremonyStatus,
  getIncumbentRecordAssessment,
  getLeadershipScoreBreakdown,
  getVillageLeader,
  getElectionRaceCandidates,
  getYearsUntilElection,
} from './villageLeadership';

export default function VillageLeadershipPanel({ state }: { state: WorldState }) {
  const leader = getVillageLeader(state);
  const yearsUntil = getYearsUntilElection(state);
  const rankings = getElectionRaceCandidates(state, 4);
  const leaderBreakdown = leader ? getLeadershipScoreBreakdown(state, leader) : null;
  const leaderRecord = leader ? getIncumbentRecordAssessment(state, leader) : null;
  const ceremonyStatus = getElectionCeremonyStatus(state);

  return (
    <div className="rounded-xl border border-amber-600/30 bg-amber-950/20 p-3">
      <h3 className="mb-1 text-xs font-bold text-amber-200">👑 Village head</h3>
      <p className="mb-2 text-[9px] leading-relaxed text-stone-500">
        The founding male leads until Year {ELECTION_INTERVAL_YEARS}. After that, merit elections every {ELECTION_INTERVAL_YEARS} years — men and women compete equally. The sitting head always runs when eligible; skills and experience decide most races, with a modest record bonus or penalty from economy, scandals, and village health. A standout challenger can still win. If the head dies, a new election is held two years later.
      </p>

      {ceremonyStatus && (
        <p className="mb-2 rounded-lg bg-amber-900/30 px-2 py-1.5 text-[9px] leading-relaxed text-amber-100/90">
          {ceremonyStatus}
        </p>
      )}

      {leader ? (
        <div className="mb-2 rounded-lg bg-stone-900/50 px-2 py-1.5">
          <p className="text-[11px] font-bold text-amber-100">{formatSettlerName(leader)}</p>
          <p className="text-[9px] text-stone-400">
            In office since Year {state.leaderSinceYear}
            {yearsUntil === 0 ? ' · election this year' : ` · next election in ${yearsUntil}y`}
          </p>
          {leaderBreakdown && (
            <p className="mt-1 text-[8px] text-stone-500">
              Merit {leaderBreakdown.totalScore} — skills {leaderBreakdown.skillPoints}, experience {leaderBreakdown.experiencePoints}
              {leaderBreakdown.servicePoints > 0 ? `, Town Hall +${leaderBreakdown.servicePoints}` : ''}
              {leaderBreakdown.communityPoints > 0 ? `, family +${leaderBreakdown.communityPoints}` : ''}
              {leaderBreakdown.recordPoints > 0 ? `, record +${leaderBreakdown.recordPoints}` : ''}
              {leaderBreakdown.recordPoints < 0 ? `, record ${leaderBreakdown.recordPoints}` : ''}
            </p>
          )}
          {leaderRecord && (
            <p className="mt-1 text-[8px] leading-relaxed text-stone-500">
              Record: economy {leaderRecord.economyStatus}
              {leaderRecord.economyPoints !== 0 ? ` (${leaderRecord.economyPoints > 0 ? '+' : ''}${leaderRecord.economyPoints})` : ''}
              {' · '}village {leaderRecord.villageStatus}
              {leaderRecord.villageHealthPoints !== 0 ? ` (${leaderRecord.villageHealthPoints > 0 ? '+' : ''}${leaderRecord.villageHealthPoints})` : ''}
              {' · '}
              {leaderRecord.scandalStatus === 'clean' ? 'no scandals' : `${leaderRecord.scandalCount} scandal${leaderRecord.scandalCount === 1 ? '' : 's'}`}
              {leaderRecord.scandalPoints !== 0 ? ` (${leaderRecord.scandalPoints > 0 ? '+' : ''}${leaderRecord.scandalPoints})` : ''}
            </p>
          )}
        </div>
      ) : (
        <p className="mb-2 text-[10px] text-rose-300">No village head — adults will elect when eligible.</p>
      )}

      {rankings.length > 1 && (
        <div className="space-y-1">
          <p className="text-[9px] font-semibold text-stone-400">Leadership standings</p>
          {rankings.map((c, i) => (
            <div
              key={c.entityId}
              className={`flex items-center justify-between rounded px-2 py-0.5 text-[8px] ${
                c.entityId === state.villageLeaderId ? 'bg-amber-900/40 text-amber-100' : 'bg-stone-800/40 text-stone-400'
              }`}
            >
              <span>{i + 1}. {c.name}{c.entityId === state.villageLeaderId ? ' 👑' : ''}</span>
              <span>
                {c.totalScore} merit
                {c.recordPoints > 0 ? ` (+${c.recordPoints} record)` : ''}
                {c.recordPoints < 0 ? ` (${c.recordPoints} record)` : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}