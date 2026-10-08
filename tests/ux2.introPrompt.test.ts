/**
 * F-UX-6 — the intro's ready prompt read "Press any key or click to continue" while the key handler
 * deliberately ignores Escape, Tab, modifier chords and an activatable target.
 *
 * The guard is correct behaviour (Tab must still reach the mute control beside the call to action),
 * so the copy is what has to name the keys the handler actually accepts. These two cases fail if
 * either half drifts back: a bare "any key" promise, or a guard whose reserved keys are unnamed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  // `UX2_SOURCE_ROOT` mirrors a pre-fix tree (`tmp/red-before`) so the red-before proof can run
  // these same guards without touching `src/`.
  return readFileSync(resolve(process.env.UX2_SOURCE_ROOT ?? process.cwd(), relativePath), 'utf8');
}

describe('intro ready prompt matches the keys the handler accepts', () => {
  const screen = read('src/game/IntroScreen.tsx');

  it('does not promise a key the handler ignores', () => {
    expect(screen, 'the prompt promises "any key" again').not.toContain(
      'Press any key or click to continue',
    );
  });

  it('names Escape and Tab in the prompt, and still reserves them in the guard', () => {
    expect(screen).toContain("if (event.key === 'Escape' || event.key === 'Tab') return;");
    const prompt = screen.match(/Click anywhere[^<]*/)?.[0] ?? '';
    expect(prompt, 'the prompt vanished').not.toBe('');
    expect(prompt, 'the prompt does not name Escape').toContain('Escape');
    expect(prompt, 'the prompt does not name Tab').toContain('Tab');
  });
});
