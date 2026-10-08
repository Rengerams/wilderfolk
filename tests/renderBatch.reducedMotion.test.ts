/**
 * F-RND-25 — the OS reduced-motion preference has to reach what the canvas animates.
 *
 * Every pulse, bob, sway and sparkle on the map reads the renderer's oscillator clock, and the
 * camera shake is applied straight from the snapshot. Honouring `prefers-reduced-motion` means the
 * oscillator holds still and the shake is dropped, while `renderTime` keeps advancing so weather
 * drift and particle integration still move (reduced, not stopped).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

/** Fresh module state per case — the media query is read and cached once per module instance. */
async function sharedModule(matches: boolean) {
  vi.stubGlobal('window', {
    matchMedia: (query: string) => ({
      matches: matches && query === '(prefers-reduced-motion: reduce)',
    }),
  });
  vi.resetModules();
  return import('../src/game/renderer/shared');
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('F-RND-25 — reduced motion reaches the canvas', () => {
  it('holds the oscillator clock while renderTime keeps advancing', async () => {
    const shared = await sharedModule(true);
    shared.resetRenderClock();
    shared.tickRenderClock(1000);
    const renderAfterFirst = shared.renderTime;
    const motionAfterFirst = shared.motionTime;
    shared.tickRenderClock(1016);

    expect(shared.prefersReducedMotion()).toBe(true);
    expect(shared.renderTime).toBeGreaterThan(renderAfterFirst);
    expect(shared.motionTime).toBe(motionAfterFirst);
  });

  it('advances both clocks when the preference is not expressed', async () => {
    const shared = await sharedModule(false);
    shared.resetRenderClock();
    shared.tickRenderClock(1000);
    shared.tickRenderClock(1016);

    expect(shared.prefersReducedMotion()).toBe(false);
    expect(shared.motionTime).toBeGreaterThan(0);
    expect(shared.motionTime).toBeCloseTo(shared.renderTime, 6);
  });

  it('drops camera shake to zero and leaves it alone otherwise', async () => {
    const reduced = await sharedModule(true);
    expect(reduced.effectiveScreenShake(9)).toBe(0);

    const full = await sharedModule(false);
    expect(full.effectiveScreenShake(9)).toBe(9);
  });

  it('treats a platform with no matchMedia as motion-allowed', async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const shared = await import('../src/game/renderer/shared');
    expect(shared.prefersReducedMotion()).toBe(false);
  });

  it('drops the settlers step bob while reduced, and keeps it otherwise', async () => {
    const walker = { id: 3, vx: 1, vy: 0, animFrame: 2 } as never;

    const reduced = await sharedModule(true);
    const reducedDrawing = await import('../src/game/renderer/spriteDrawing');
    expect(reduced.prefersReducedMotion()).toBe(true);
    expect(reducedDrawing.getHumanWalkMotion(walker, 1, true, 1)).toEqual({});

    await sharedModule(false);
    const fullDrawing = await import('../src/game/renderer/spriteDrawing');
    expect(fullDrawing.getHumanWalkMotion(walker, 1, true, 1).bobY).toBeGreaterThan(0);
  });
});
