/**
 * Rendered inspector behaviour: the fourteen inherited aptitudes, derived highlights, the same
 * activity factors the simulation uses, advisory job fit and witnessed career facts only.
 * Every expectation is read from the owning modules, never rebuilt here.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import PersonalityCareerDetails from '../src/components/PersonalityCareerDetails';
import SelectedEntityPanel from '../src/components/SelectedEntityPanel';
import { APTITUDE_DEFS, APTITUDE_IDS } from '../src/game/settlerTraits';
import { CAREER_TIER_LABELS } from '../src/game/careers/careerProgression';
import { EntityType, JOB_LABELS, JobType } from '../src/game/gameTypes';
import type { Entity, WorldState } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/playerHuman';
import { initGame } from '../src/game/worldGen';
import { human } from '../src/test/factories';
import { genomeFrom } from './helpers/genome';

const ROUTINE_GENOME = genomeFrom({ discipline: 95, persistence: 95, flexibility: 10, curiosity: 10 });

function render(entity: Entity): string {
  return renderToStaticMarkup(createElement(PersonalityCareerDetails, { entity }));
}

function renderPanel(entity: Entity, state: WorldState): string {
  return renderToStaticMarkup(createElement(SelectedEntityPanel, {
    entity,
    allEntities: state.entities,
    state,
    onOpenFamilyTree: () => {},
  }));
}

function livingSettler(state: WorldState): Entity {
  const settler = state.entities.find((entity) => entity.alive && isPlayerHuman(entity));
  if (!settler) throw new Error('the seeded colony has no living settler');
  return settler;
}

describe('personality and career inspector', () => {
  it('names all fourteen inherited aptitudes', () => {
    const markup = render(human(1, { genomeV2: genomeFrom(), job: JobType.Farmer }));
    expect(markup).toContain('Inherited aptitudes');
    for (const id of APTITUDE_IDS) {
      expect(markup, id).toContain(APTITUDE_DEFS[id].label);
    }
  });

  it('derives read-only highlight descriptors from the person own strongest deviations', () => {
    const markup = render(human(1, { genomeV2: genomeFrom({ sociability: 95, composure: 5 }) }));
    expect(markup).toContain('Most distinctive');
    expect(markup).toContain(APTITUDE_DEFS.sociability.high);
    expect(markup).toContain(APTITUDE_DEFS.composure.low);
  });

  it('shows the real activity result the simulation uses', () => {
    const markup = render(human(1, { genomeV2: ROUTINE_GENOME, job: JobType.Farmer }));
    expect(markup).toContain('Activity effect');
    expect(markup).toContain('Routine production');
  });

  it('labels aptitude as a potential job fit for the current trade only', () => {
    const farmer = render(human(1, { genomeV2: ROUTINE_GENOME, job: JobType.Farmer }));
    expect(farmer).toContain(`Potential job fit — ${JOB_LABELS[JobType.Farmer]}`);
    expect(farmer).toContain(`${APTITUDE_DEFS.discipline.label}: ${APTITUDE_DEFS.discipline.high}`);
    // A neutral profile has no catalogued production effect, and says so.
    const smith = render(human(2, { genomeV2: genomeFrom(), job: JobType.Blacksmith }));
    expect(smith).toContain('No personality effect on this trade');
  });

  it('switches with the selected person and never carries the previous record', () => {
    const farmer = render(human(1, {
      genomeV2: ROUTINE_GENOME,
      job: JobType.Farmer,
      skills: { [JobType.Farmer]: 40 },
      careerHistory: { [JobType.Farmer]: { days: 22, lastDay: 30 } },
    }));
    const smith = render(human(2, {
      genomeV2: genomeFrom({ creativity: 95, reasoning: 90 }),
      job: JobType.Blacksmith,
      careerHistory: { [JobType.Blacksmith]: { days: 4, lastDay: 9 } },
    }));

    expect(farmer).toContain('22 credited days');
    expect(farmer).not.toContain('4 credited days');

    expect(smith).toContain('4 credited days');
    expect(smith).not.toContain('22 credited days');
  });

  it('reports an absent career as no recorded work instead of inferring one', () => {
    expect(render(human(3, { genomeV2: genomeFrom() }))).toContain('No recorded career work yet');
    expect(render(human(3, { genomeV2: genomeFrom() }))).not.toContain('Potential job fit');
    // A saved skill can outlive its record: the row stays, the days stay honestly empty.
    const skilled = render(human(4, { genomeV2: genomeFrom(), skills: { [JobType.Miner]: 12 } }));
    expect(skilled).toContain(`${JOB_LABELS[JobType.Miner]} · skill 12/100`);
    expect(skilled).toContain('No recorded career days.');
  });

  it('shows a saved tier with its attainment day and a genuine apprenticeship date', () => {
    const markup = render(human(4, {
      genomeV2: genomeFrom(),
      job: JobType.Builder,
      careerHistory: { [JobType.Builder]: { days: 61, lastDay: 80 } },
      careerMilestones: { [JobType.Builder]: { tier: 'experienced', tierAtDay: 66, trainedAtDay: 12 } },
    }));
    expect(markup).toContain('61 credited days');
    expect(markup).toContain('last worked colony day 80');
    expect(markup).toContain(CAREER_TIER_LABELS.experienced);
    expect(markup).toContain('reached colony day 66');
    expect(markup).toContain('Apprenticeship completed');
    expect(markup).toContain('colony day 12');
    expect(markup).not.toContain(CAREER_TIER_LABELS.master);
  });

  it('leaves foreign visitors, animals, transformed Moon Howlers and the dead out', () => {
    expect(render(human(5, { faction: 'visitor', genomeV2: genomeFrom() }))).toBe('');
    expect(render(human(6, { type: EntityType.Wolf, genomeV2: genomeFrom() }))).toBe('');
    expect(render(human(7, { type: EntityType.Werewolf, moonHowlerCursed: true, genomeV2: genomeFrom() }))).toBe('');
    expect(render(human(8, { alive: false, genomeV2: genomeFrom() }))).toBe('');
  });

  it('renders without writing to the saved record', () => {
    const person = human(9, {
      genomeV2: genomeFrom({ discipline: 90, composure: 10 }),
      job: JobType.Miner,
      skills: { [JobType.Miner]: 31 },
      careerHistory: { [JobType.Miner]: { days: 16, lastDay: 21 } },
      careerMilestones: { [JobType.Miner]: { tier: 'practiced', tierAtDay: 15 } },
    });
    const before = structuredClone(person);
    render(person);
    expect(person).toEqual(before);
  });

  it('reaches the panel for a living player settler and is absent for a visitor', () => {
    const state = initGame({ seed: 20_261_029 });
    expect(renderPanel(livingSettler(state), state)).toContain('Personality and career');

    const visitor = human(777, { faction: 'visitor', genomeV2: genomeFrom() });
    expect(renderPanel(visitor, state)).not.toContain('Personality and career');
  });
});
