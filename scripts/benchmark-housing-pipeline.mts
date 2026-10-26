/** Benchmarks the full housing authority, not just commute relocation. */
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { initGame } from '../src/game/gameEngine';
import { MapSize, BuildingType } from '../src/game/gameTypes';
import { assignMissingResidences } from '../src/game/residencyReconciliation';
import { resetPathGridCaches, setCurrentPathMap } from '../src/game/pathfinding';
import { isPlayerHuman } from '../src/game/playerHuman';
import { enableSeededGlobalRandom } from '../src/game/simRng';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { loadNames } from '../src/game/nameLoader';
import { TICKS_PER_DAY } from '../src/game/dayCycleClock';
import { createCompletedBuilding } from './colonyHealth';
import { DEFAULT_CITY_TARGETS, seedCityScaleProfile } from './simCityProfile';

const seed = Number(process.env.PERF_SEED ?? 12345);
const populations = (process.env.PERF_POPS ?? '600,1200,2400').split(',').map(Number);
const repeats = Number(process.env.PERF_REPEATS ?? 8);

function median(values: number[]): number {
  const sorted = [...values].sort((a,b) => a-b);
  return sorted[Math.floor(sorted.length/2)] ?? 0;
}

async function main(): Promise<void> {
  enableSeededGlobalRandom();
  await preloadDialogueBank();
  await loadNames().catch(() => {});
  for (const population of populations) for (const spareHomes of [0, Math.ceil(population/30)]) {
    for (const scenario of ['stable','displaced'] as const) {
      const times:number[]=[];
      let relocations=0, violations=0, assignmentHash='', initialHash='';
      let assignments: Array<[number, number | null]> = [];
      let moveDetails: Array<{phase:string;members:number[];from?:number;to?:number}> = [];
      for(let sample=0;sample<repeats;sample++) {
    resetPathGridCaches();
    const state = initGame({ size: MapSize.Large, seed });
    seedCityScaleProfile(state, { ...DEFAULT_CITY_TARGETS, playerHumans: population });
    const humans = state.entities.filter(e => e.alive && isPlayerHuman(e));
    state.buildings = [];
    for (let i=0; i<humans.length; i+=3) {
      const x = 200+(i%30)*32, y=200+Math.floor(i/30)*32;
      const home = createCompletedBuilding(state, BuildingType.House, x, y);
      const job = createCompletedBuilding(state, BuildingType.Farm, x+300, y);
      const school = createCompletedBuilding(state, BuildingType.School, x+96, y);
      const family = humans.slice(i,i+3);
      for (const member of family) {
        member.age=30;
        member.isJuvenile=false;
        member.partnerId=undefined;
        member.motherId=undefined;
        member.fatherId=undefined;
        member.childrenIds=[];
        member.residenceBuildingId=home.id;
        member.workerBuildingId=job.id;
      }
      if (family.length===3) {
        family[0].gender='female';
        family[1].gender='male';
        family[0].partnerId=family[1].id;
        family[1].partnerId=family[0].id;
        family[2].age=8;
        family[2].isJuvenile=true;
        family[2].motherId=family[0].id;
        family[2].fatherId=family[1].id;
        family[2].workerBuildingId=undefined;
        family[2].schoolBuildingId=school.id;
      }
    }
    for(let i=0;i<spareHomes;i++) createCompletedBuilding(state,BuildingType.House,500+(i%10)*48,200+Math.floor(i/10)*48);
    // Confirm both revisions actually start from the same fixture before judging output parity.
    const inputHash = createHash('sha256').update(JSON.stringify({
      entities: humans.map(h => [h.id,h.age,h.partnerId,h.motherId,h.fatherId,
        h.residenceBuildingId,h.workerBuildingId,h.schoolBuildingId]),
      homes: state.buildings.map(b => [b.id,b.type,b.x,b.y,b.level,b.completed]),
    })).digest('hex');
    if (sample===0) initialHash=inputHash;
    else if (inputHash !== initialHash) throw new Error('Non-deterministic initial fixture for '+population+'/'+spareHomes+'/'+scenario);
    // Every sample owns a fresh fixture; no roster, genealogy or occupancy state leaks between runs.
    if (scenario === 'displaced') humans.forEach((human,i) => {
      if (i%15===0) human.residenceBuildingId=undefined;
    });
        setCurrentPathMap(state.worldMap!,state.buildings);
        const t=performance.now();
        const report=assignMissingResidences(humans,state.buildings,humans,TICKS_PER_DAY-1);
        times.push(performance.now()-t);
        relocations=report.relocations.length;
        moveDetails=report.relocations.map(m => ({phase:m.phase,members:m.members,from:m.from,to:m.to}));
        violations=report.violations.length;
        assignments = humans.map(h=>[h.id,h.residenceBuildingId ?? null]);
        assignmentHash=createHash('sha256').update(JSON.stringify(assignments)).digest('hex');
      }
      console.log('HOUSING_PIPELINE_RESULT '+JSON.stringify({population,spareHomes,scenario,repeats,warmMedianMs:median(times.slice(2)),coldMs:times[0],relocations,violations,initialHash,assignmentHash,assignments:process.env.PERF_ASSIGNMENT_DETAIL==='1'?assignments:undefined,moveDetails:process.env.PERF_ASSIGNMENT_DETAIL==='1'?moveDetails:undefined}));
    }
  }
}
main().catch(err=>{console.error(err);process.exitCode=1;});
