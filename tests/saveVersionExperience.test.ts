/**
 * The About box must state the save-compatibility rule from the save owner, so the menu cannot drift
 * from the message a refused load shows.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describeSaveCompatibility, describeSaveReadFailure } from '../src/game/saveLoad';
import { GAME_VERSION } from '../src/game/version';

function read(relativePath: string): string {
  // `SAVE_VERSION_EXPERIENCE_ROOT` points the read at a mirrored tree for red-before runs.
  const root = process.env.SAVE_VERSION_EXPERIENCE_ROOT ?? process.cwd();
  return readFileSync(resolve(root, relativePath), 'utf8');
}

describe('save-version experience (roadmap T4)', () => {
  it('names the build the player is running and what an update costs them', () => {
    const text = describeSaveCompatibility();

    expect(text, 'the rule must name the running build').toContain(`v${GAME_VERSION}`);
    expect(text).toContain('v0.6.5.0');
  });

  it('states the same version policy the refusal does (one source of truth)', () => {
    // Both messages come from the save owner, so neither can describe a different policy.
    const refusal = describeSaveReadFailure({
      reason: 'version-mismatch',
      detail: `save 0.0.1 vs build ${GAME_VERSION}`,
    });

    expect(refusal).toContain('not supported');
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
