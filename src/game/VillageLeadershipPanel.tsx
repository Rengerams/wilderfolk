import type { WorldState } from './gameTypes';
import { displayYear } from './dayCycleClock';
import {
  ELECTION_INTERVAL_YEARS,
  formatElectionDelay,
  formatSettlerName,
  getElectionCeremonyStatus,
  getIncumbentRecordAssessment,
  getLeadershipScoreBreakdown,
  getVillageLeader,
  getElectionRaceCandidates,
  getYearsUntilElection,
  VACANCY_ELECTION_DELAY_YEARS,
} from './villageLeadership';
import { getActiveElectionPromises } from './electionPromises';

export default function VillageLeadershipPanel({ state }: { state: WorldState }) {
  const leader = getVillageLeader(state);
  const yearsUntil = getYearsUntilElection(state);
  const rankings = getElectionRaceCandidates(state, 4);
  const leaderBreakdown = leader ? getLeadershipScoreBreakdown(state, leader) : null;
  const leaderRecord = leader ? getIncumbentRecordAssessment(state, leader) : null;
  const ceremonyStatus = getElectionCeremonyStatus(state);
  // The promise system judges the player 180 game days after the ceremony (`EVAL_DAY_OFFSET`), and
  // until now nothing in the UI said what was promised or how it was going
  // (`LIVE-FINDINGS-STATUS.md`, F4).
  const promises = getActiveElectionPromises(state);
  const lastVote = state.lastElectionResult;
  const liveVote = state.electionCeremony?.ballotCast ? state.electionCeremony : null;
  const ballotEntries = liveVote?.ballotTally ?? lastVote?.tally ?? {};
  const ballots = liveVote?.ballotTotal ?? lastVote?.ballots ?? 0;
  const voters = liveVote ? state.entities.filter((person) => person.alive && person.type === 'human' && !person.faction && !person.isJuvenile).length : lastVote?.eligibleVoters ?? 0;

  return (
    <div className="rounded-xl border border-amber-600/30 bg-amber-950/20 p-3">
      <h3 className="mb-1 text-sm font-bold text-amber-200">👑 Village head</h3>
      <p className="mb-2 text-[13px] leading-relaxed text-stone-300">
        The founding settler — the first adult male, where the colony has one — holds office until the first merit election in Year {displayYear(ELECTION_INTERVAL_YEARS)}. After that, a term election is held every {ELECTION_INTERVAL_YEARS} years. The sitting head always runs when eligible; skills and experience decide most races, with a modest record bonus or penalty from economy, scandals, and village health. A standout challenger can still win. If the head dies or is imprisoned, a new election is held {formatElectionDelay(VACANCY_ELECTION_DELAY_YEARS)} later.
      </p>

      {ceremonyStatus && (
        <p className="mb-2 rounded-lg bg-amber-900/30 px-2 py-1.5 text-[13px] leading-relaxed text-amber-100/90">
          {ceremonyStatus}
        </p>
      )}

      {leader ? (
        <div className="mb-2 rounded-lg bg-stone-900/50 px-2 py-1.5">
          <p className="text-[13px] font-bold text-amber-100">{formatSettlerName(leader)}</p>
          <p className="text-[13px] text-stone-300">
            In office since Year {displayYear(state.leaderSinceYear)}
            {yearsUntil === 0 ? ' · election this year' : ` · next election in ${yearsUntil}y`}
          </p>
          {leaderBreakdown && (
            <p className="mt-1 text-[10px] text-stone-300">
              Merit {leaderBreakdown.totalScore} — skills {leaderBreakdown.skillPoints}, experience {leaderBreakdown.experiencePoints}
              {leaderBreakdown.battlePoints > 0 ? `, battles +${leaderBreakdown.battlePoints}` : ''}
              {leaderBreakdown.familyPoints > 0 ? `, family name +${leaderBreakdown.familyPoints}` : ''}
              {leaderBreakdown.communityPoints > 0 ? `, family +${leaderBreakdown.communityPoints}` : ''}
              {leaderBreakdown.recordPoints > 0 ? `, record +${leaderBreakdown.recordPoints}` : ''}
              {leaderBreakdown.recordPoints < 0 ? `, record ${leaderBreakdown.recordPoints}` : ''}
            </p>
          )}
          {leaderRecord && (
            <p className="mt-1 text-[10px] leading-relaxed text-stone-300">
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
        <p className="mb-2 text-[13px] text-rose-300">No village head — adults will elect when eligible.</p>
      )}

      {promises && (
        <div className="mb-2 rounded-lg bg-stone-900/50 px-2 py-1.5">
          <p className="text-[13px] font-bold text-amber-100">📜 Campaign promises</p>
          <p className="text-[10px] text-stone-400">
            Judged in {promises.daysRemaining} day{promises.daysRemaining === 1 ? '' : 's'}
          </p>
          <div className="mt-1 space-y-1">
            {promises.promises.map((p) => (
              <div key={p.code}>
                <div className="flex items-baseline justify-between gap-2 text-[10px]">
                  <span className={p.fulfilled ? 'text-emerald-300' : 'text-stone-300'}>{p.label}</span>
                  <span className="shrink-0 text-stone-400">{p.current} / {p.target}</span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded bg-stone-700">
                  <div
                    className={`h-full rounded ${p.fulfilled ? 'bg-emerald-500' : 'bg-amber-500'}`}
                    style={{ width: `${p.pct}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(liveVote || lastVote) && (
        <div className="mb-2 rounded-lg bg-stone-900/50 px-2 py-2 text-[12px] text-stone-200">
          <p className="font-bold text-amber-100">{liveVote ? 'Election ballots recorded — reveal pending' : `Last election #${lastVote?.electionId ?? 0}`}</p>
          <p className="text-stone-400">{ballots} ballots cast · {voters} eligible voters · {voters > 0 ? Math.round((ballots / voters) * 100) : 0}% turnout</p>
          <div className="mt-2 space-y-1">
            {Object.entries(ballotEntries).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, count]) => {
              const entity = state.entities.find((person) => person.id === Number(id));
              return (
                <div key={id}>
                  <div className="flex justify-between gap-2"><span>{entity ? formatSettlerName(entity) : `Candidate #${id}`}</span><span>{count} · {ballots > 0 ? (count / ballots * 100).toFixed(1) : '0.0'}%</span></div>
                  <div className="h-1.5 rounded bg-stone-700 overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${ballots > 0 ? (count / ballots) * 100 : 0}%` }}/></div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {rankings.length > 1 && (
        <div className="space-y-1">
          <p className="text-[13px] font-semibold text-stone-300">Leadership standings</p>
          {rankings.map((c, i) => (
            <div
              key={c.entityId}
              className={`flex items-center justify-between rounded px-2 py-0.5 text-[10px] ${
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