/**
 * The intro's ready prompt must name the keys the handler accepts — Escape and Tab stay reserved —
 * instead of promising "any key".
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function read(relativePath: string): string {
  // `UX2_SOURCE_ROOT` points these guards at a mirrored source tree for a red-before proof.
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
