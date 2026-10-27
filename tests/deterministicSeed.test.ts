import { describe, expect, it, afterEach } from "vitest";
import { initGame, gameTick } from "../src/game/gameEngine";
import { MapSize } from "../src/game/gameTypes";
import { resetSimRng, setSimSeed } from "../src/game/simRng";

function snapshot(world: ReturnType<typeof initGame>): string {
  return JSON.stringify({
    tick: world.tick,
    resources: world.resources,
    entities: world.entities
      .filter((e) => e.alive)
      .map((e) => [
        e.id,
        e.type,
        Math.round(e.x),
        Math.round(e.y),
        Math.round(e.energy),
        e.job ?? null,
      ]),
  });
}

function runTicksSnapshot(seed: number, ticks: number): string[] {
  const world = initGame({ size: MapSize.Medium, seed });
  setSimSeed(seed);
  const out: string[] = [];
  let current = world;
  for (let i = 0; i < ticks; i++) {
    current = gameTick(current);
    out.push(snapshot(current));
  }
  return out;
}

describe("D1 deterministic simulation seed", () => {
  afterEach(() => {
    resetSimRng();
  });

  it("same seed produces the same world", () => {
    const a = initGame({ size: MapSize.Medium, seed: 12345 });
    const b = initGame({ size: MapSize.Medium, seed: 12345 });
    expect(snapshot(a)).toBe(snapshot(b));
  });

  it("different seeds produce different worlds", () => {
    const a = initGame({ size: MapSize.Medium, seed: 111 });
    const b = initGame({ size: MapSize.Medium, seed: 999 });
    expect(snapshot(a)).not.toBe(snapshot(b));
  });

  it("100-tick replay is deterministic (D1 long-replay)", () => {
    const a = runTicksSnapshot(4242, 100);
    const b = runTicksSnapshot(4242, 100);
    expect(a).toEqual(b);
  });
});