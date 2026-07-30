/**
 * Screen juice: particles, floating text, notifications, big news, shake.
 */
import type { DeathParticle, WorldState } from './gameTypes';
import { pushTransientParticle } from './juiceEffects';

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
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.5 + Math.random() * 1.5;
    pushTransientParticle(state, {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 25 + Math.random() * 15,
      maxLife: 40,
      color,
      size: 1.5 + Math.random() * 1.5,
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
) {
  state.notifications.push({
    id: `notif_${state.tick}_${Math.random()}`,
    title,
    message,
    type,
    createdAt: Date.now(),
  });
  if (state.notifications.length > 20) state.notifications.shift();
}

let nextBigNewsId = 1;

/** Restore monotonic big-news ids after loading a save or hot reload. */
export function syncBigNewsIdFromState(state: Pick<WorldState, 'bigNews'>): void {
  let maxSeq = 0;
  for (const item of state.bigNews) {
    const match = /^bn_(\d+)$/.exec(item.id) ?? /^bn_\d+_(\d+)_/.exec(item.id);
    if (match) {
      const seq = Number(match[1]);
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  nextBigNewsId = maxSeq + 1;
}

export function addBigNews(
  state: WorldState,
  title: string,
  message: string,
  type: 'positive' | 'negative' | 'neutral' = 'neutral',
) {
  const seq = nextBigNewsId++;
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
