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
  it('uses upright wall modules horizontally and rotated deck art vertically', () => {
    for (const [w, h, angle] of [[72, 12, 0], [12, 72, 90]] as const) {
      const { context, pictures, rotations } = spyCanvas();
      drawProceduralWall(context, 50, 60, w, h, angle, false);
      if (angle === 0) {
        expect(pictures.length).toBeGreaterThan(1);
        expect(pictures.every((picture) => picture.path.endsWith('/wall.png'))).toBe(true);
        expect(rotations.every((rotation) => rotation === 0)).toBe(true);
      } else {
        expect(pictures).toEqual([{ path: '/sprites/walls/wall_straight.svg', width: 72, height: 12 }]);
        expect(rotations).toEqual([Math.PI / 2, 0]);
      }
    }
  });

  it('uses one gate facade horizontally and one rotated gate deck vertically', () => {
    for (const [w, h, angle] of [[72, 12, 0], [12, 72, 90]] as const) {
      const { context, pictures, rotations } = spyCanvas();
      drawProceduralWall(context, 50, 60, w, h, angle, true);
      if (angle === 90) {
        expect(pictures).toEqual([{ path: '/sprites/walls/wall_gate.svg', width: 72, height: 12 }]);
        expect(rotations).toEqual([Math.PI / 2, 0]);
        continue;
      }
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
