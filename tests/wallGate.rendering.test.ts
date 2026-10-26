import { describe, expect, it, vi } from 'vitest';
import { drawProceduralWall, drawProceduralWallJunction } from '../src/game/stripRender';
import type { StripJunctionInfo } from '../src/game/stripJunction';

vi.mock('../src/game/spriteLoader', () => ({
  getSpriteFrame: (path: string) => ({
    image: { path }, sx: 0, sy: 0,
    sw: path.endsWith('gate.png') ? 49 : 44,
    sh: path.endsWith('gate.png') ? 57 : 48,
  }),
}));

function spyCanvas() {
  const pictures: { path: string; width: number; height: number }[] = [];
  const rotations: number[] = [];
  const context = {
    save() {}, restore() {}, translate() {},
    rotate(angle: number) { rotations.push(angle); },
    drawImage(image: { path: string }, _x: number, _y: number, width: number, height: number) {
      pictures.push({ path: image.path, width, height });
    },
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D;
  return { context, pictures, rotations };
}

describe('upright wall and gate renderer', () => {
  it('repeats upright wall modules on both construction axes', () => {
    for (const [w, h, angle] of [[72, 12, 0], [12, 72, 90]] as const) {
      const { context, pictures, rotations } = spyCanvas();
      drawProceduralWall(context, 50, 60, w, h, angle, false);
      expect(pictures.length).toBeGreaterThan(1);
      expect(pictures.every((picture) => picture.path.endsWith('/wall.png'))).toBe(true);
      expect(rotations.every((angle) => angle === 0)).toBe(true);
    }
  });

  it('places exactly one upright gate with masonry to either side', () => {
    for (const [w, h, angle] of [[72, 12, 0], [12, 72, 90]] as const) {
      const { context, pictures, rotations } = spyCanvas();
      drawProceduralWall(context, 50, 60, w, h, angle, true);
      const gates = pictures.filter((picture) => picture.path.endsWith('/gate.png'));
      expect(gates).toHaveLength(1);
      expect(gates[0].width / gates[0].height).toBeCloseTo(49 / 57);
      expect(pictures.some((picture) => picture.path.endsWith('/wall.png'))).toBe(true);
      expect(rotations.every((angle) => angle === 0)).toBe(true);
    }
  });

  it('caps stone junctions without rotating any facade', () => {
    const { context, pictures, rotations } = spyCanvas();
    const info: StripJunctionInfo = {
      kind: 'tee', cornerRotation: 0,
      connections: { north: true, south: false, east: true, west: true },
    };
    drawProceduralWallJunction(context, 20, 20, 72, 12, info);
    expect(pictures).toHaveLength(1);
    expect(pictures[0].path).toMatch(/wall\.png$/);
    expect(rotations.every((angle) => angle === 0)).toBe(true);
  });
});
