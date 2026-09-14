/**
 * Screen juice: particles, floating text, notifications, big news, shake.
 */
import type { DeathParticle, WorldState } from './gameTypes';
import { pushTransientParticle } from './juiceEffects';
import { getSimRng } from './simRng';

export { pushTransientParticle } from './juiceEffects';

export function impulseScreenShake(state: WorldState, amount: number): void {
  state.screenShakeImpulse = Math.max(state.screenShakeImpulse, amount);
}

export function createDeathParticles(
  state: WorldState,
  x: number,
  y: number,
  color: string,
  count: number,
  type?: DeathParticle['type'],
) {
  // Seeded, so a replay of the same world scatters the same particles. Resolved per call:
  // `setSimSeed` drops the cached streams, so a module-scope capture would go stale.
  const rng = getSimRng('simEffects');
  for (let i = 0; i < count; i++) {
    const angle = rng() * Math.PI * 2;
    const speed = 0.5 + rng() * 1.5;
    pushTransientParticle(state, {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 25 + rng() * 15,
      maxLife: 40,
      color,
      size: 1.5 + rng() * 1.5,
      type: type || 'blood',
    });
  }
}

type FloatingTextTier = 'brief' | 'normal' | 'emphasis';

export function addFloatingText(
  state: WorldState,
  x: number,
  y: number,
  text: string,
  color: string,
  tier: FloatingTextTier = 'normal',
) {
  const maxLife = tier === 'brief' ? 18 : tier === 'emphasis' ? 48 : 28;
  state.floatingTexts.push({
    id: state.nextFloatingTextId++,
    x,
    y,
    text,
    color,
    life: maxLife,
    maxLife,
    scale: 1,
  });
}

export function addNotification(
  state: WorldState,
  title: string,
  message: string,
  type: 'info' | 'success' | 'warning' | 'event' = 'info',
  focus?: { x: number; y: number },
  campKey?: string,
) {
  state.notifications.push({
    id: `notif_${state.tick}_${getSimRng('simEffects')()}`,
    title,
    message,
    type,
    createdAt: Date.now(),
    ...(focus ? { focus } : {}),
    ...(campKey ? { campKey } : {}),
  });
  if (state.notifications.length > 20) state.notifications.shift();
}

let nextBigNewsId = 1;

/**
 * Highest `bn_<seq>` this world has already used.
 *
 * `bigNews` is capped at 50 entries and the oldest are shifted away, so the array alone is not
 * enough: the ids a player dismissed live on in `dismissedBigNewsIds`, and re-issuing one of
 * those makes the UI hide the new card as dismissed.
 */
function highestBigNewsSeq(state: Pick<WorldState, 'bigNews' | 'dismissedBigNewsIds'>): number {
  let maxSeq = 0;
  const consider = (id: string) => {
    const match = /^bn_(\d+)$/.exec(id) ?? /^bn_\d+_(\d+)_/.exec(id);
    if (!match) return;
    const seq = Number(match[1]);
    if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
  };
  for (const item of state.bigNews) consider(item.id);
  for (const id of state.dismissedBigNewsIds ?? []) consider(id);
  return maxSeq;
}

/** Restore monotonic big-news ids after loading a save or hot reload. */
export function syncBigNewsIdFromState(state: Pick<WorldState, 'bigNews' | 'dismissedBigNewsIds'>): void {
  nextBigNewsId = highestBigNewsSeq(state) + 1;
}

export function addBigNews(
  state: WorldState,
  title: string,
  message: string,
  type: 'positive' | 'negative' | 'neutral' = 'neutral',
) {
  // The counter is module state and a realm that receives a world (worker, or the main thread's
  // optimistic copy) starts it at 1 while the world already carries ids — and dismissal ids
  // outlive the 50-entry cap. Never mint an id this world already uses.
  const seq = Math.max(nextBigNewsId, highestBigNewsSeq(state) + 1);
  nextBigNewsId = seq + 1;
  state.bigNews.push({
    id: `bn_${seq}`,
    title,
    message,
    type,
    createdAt: state.tick,
    dismissed: false,
  });
  if (state.bigNews.length > 50) state.bigNews.shift();
}
