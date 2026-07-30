import { NOTES } from './constants';
import { audioGraph } from './graph';
import { scheduleTone } from './scheduler';

function sfx(
  freq: number,
  duration: number,
  gain: number,
  type: OscillatorType = 'sine',
  delay = 0,
  duck = true,
) {
  if (duck) audioGraph.duckMusic();
  scheduleTone('sfx', freq, duration, gain, type, delay);
}

export function playBuildSound() {
  sfx(330, 0.08, 0.12, 'triangle', 0, false);
  sfx(440, 0.1, 0.1, 'triangle', 0.07, false);
  sfx(554, 0.14, 0.08, 'sine', 0.14);
}

export function playBirthSound() {
  sfx(NOTES.C5, 0.22, 0.09, 'sine', 0, false);
  sfx(NOTES.E5, 0.22, 0.09, 'sine', 0.1, false);
  sfx(NOTES.G5, 0.35, 0.08, 'sine', 0.2, false);
  sfx(NOTES.C6, 0.45, 0.06, 'triangle', 0.32);
}

export function playHuntSound() {
  sfx(220, 0.08, 0.08, 'triangle');
  sfx(165, 0.12, 0.06, 'triangle', 0.06, false);
}

export function playDeathSound() {
  sfx(280, 0.2, 0.07, 'triangle', 0, false);
  sfx(200, 0.28, 0.05, 'triangle', 0.12, false);
  sfx(120, 0.35, 0.04, 'sine', 0.22);
}

export function playMarriageSound() {
  sfx(NOTES.C5, 0.28, 0.08, 'sine', 0, false);
  sfx(NOTES.E5, 0.28, 0.08, 'sine', 0.08, false);
  sfx(NOTES.G5, 0.28, 0.08, 'sine', 0.16, false);
  sfx(NOTES.C6, 0.45, 0.07, 'sine', 0.24);
}

export function playUpgradeSound() {
  sfx(NOTES.G4, 0.08, 0.1, 'triangle', 0, false);
  sfx(NOTES.C5, 0.08, 0.1, 'triangle', 0.07, false);
  sfx(NOTES.E5, 0.08, 0.1, 'triangle', 0.14, false);
  sfx(NOTES.G5, 0.22, 0.08, 'sine', 0.21);
}

export function playErrorSound() {
  sfx(180, 0.12, 0.09, 'triangle', 0, false);
  sfx(130, 0.18, 0.07, 'triangle', 0.1);
}

export function playClickSound() {
  sfx(620, 0.04, 0.05, 'sine', 0, false);
}

export function playDisasterSound() {
  for (let i = 0; i < 4; i++) {
    sfx(90 + Math.random() * 120, 0.22, 0.06, 'triangle', i * 0.09, i === 0);
  }
}

export function playResearchCompleteSound() {
  sfx(NOTES.C4, 0.12, 0.08, 'sine', 0, false);
  sfx(NOTES.E4, 0.12, 0.08, 'sine', 0.08, false);
  sfx(NOTES.G4, 0.12, 0.08, 'sine', 0.16, false);
  sfx(NOTES.C5, 0.35, 0.09, 'triangle', 0.24);
}