import { audioGraph } from './graph';
import type { AudioBus } from './graph';

export function scheduleTone(
  bus: AudioBus,
  freq: number,
  duration: number,
  peak: number,
  type: OscillatorType = 'sine',
  delay = 0,
) {
  const gainNode = audioGraph.bus(bus);
  if (!gainNode || audioGraph.isMuted) return;

  const ctx = audioGraph.context;
  const start = ctx.currentTime + delay;
  const end = start + duration;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(g);
  g.connect(gainNode);
  osc.start(start);
  osc.stop(end + 0.02);
}