export interface RenffrLetter {
  char: string;
  nx: number;
  ny: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
}

export interface RenffrOmen {
  life: number;
  maxLife: number;
  phase: number;
  phaseTimer: number;
  streakT: number;
  letters: RenffrLetter[];
}
