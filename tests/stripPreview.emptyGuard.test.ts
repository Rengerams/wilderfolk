import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), 'utf8');
}

describe('empty strip preview render guards', () => {
  it('does not publish an empty demolition or road-build preview', () => {
    const interactions = source('hooks/useCanvasInteractions.ts');
    expect(interactions).toContain('buildStripPreview: segments.length > 0');
    expect(interactions).toContain('buildStripPreview: preview.segments.length > 0 ? preview : null');
  });

  it('keeps the selected R rotation on a click without pointer travel', () => {
    const interactions = source('hooks/useCanvasInteractions.ts');
    expect(interactions).toContain('const rotation = dragged');
    expect(interactions).toContain(': loop?.getView().buildRotation ?? 0;');
    expect(interactions).toContain('rotation, dragged ? stroke : undefined,');
  });

  it('does not dereference an empty preview inside the render dirty-key', () => {
    const loop = source('game/gameLoop.ts');
    expect(loop).toContain('strip?.segments.length ?');
  });
});
