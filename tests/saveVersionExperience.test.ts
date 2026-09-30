/**
 * Roadmap **T4** — *"the game explains when a new settlement is needed and what a save version
 * means."*
 *
 * The refusal path already names both versions (`describeSaveReadFailure`, pinned by
 * `tests/saveRead.failureReason.test.ts`). What was missing is the rule stated **before** the player
 * hits it: the About box said "Saves may break between updates", which is neither the rule nor an
 * explanation. The sentence now comes from the save owner, so the menu cannot drift from the message
 * a refused load shows.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describeSaveCompatibility, describeSaveReadFailure } from '../src/game/saveLoad';
import { GAME_VERSION } from '../src/game/version';

function read(relativePath: string): string {
  // `SAVE_VERSION_EXPERIENCE_ROOT` lets the red-before proof run this guard against a mirrored
  // pre-fix tree (`tmp/red-before-t4`) without touching `src/`.
  const root = process.env.SAVE_VERSION_EXPERIENCE_ROOT ?? process.cwd();
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('save-version experience (roadmap T4)', () => {
  it('names the build the player is running and what an update costs them', () => {
    const text = describeSaveCompatibility();

    expect(text, 'the rule must name the running build').toContain(`v${GAME_VERSION}`);
    expect(text, 'the rule must say a new settlement is needed after an update').toMatch(
      /start a new settlement/i,
    );
  });

  it('states the same version policy the refusal does (one source of truth)', () => {
    // Both messages come from the save owner, so neither can describe a different policy.
    const refusal = describeSaveReadFailure({
      reason: 'version-mismatch',
      detail: `save 0.0.1 vs build ${GAME_VERSION}`,
    });

    expect(refusal).toContain('different build');
    expect(refusal, 'the refusal names the build the player is running').toContain(GAME_VERSION);
    expect(describeSaveCompatibility()).toContain(`v${GAME_VERSION}`);
  });

  it('renders the owner sentence in the menu instead of a second copy', () => {
    const menu = read('src/components/GameMenu.tsx');

    expect(menu, 'the menu no longer renders the save owner’s sentence').toContain(
      'describeSaveCompatibility',
    );
    expect(menu, 'the vague pre-fix copy is back').not.toContain('Saves may break between updates');
  });
});
