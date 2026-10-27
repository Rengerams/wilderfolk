/**
 * Temporary probe (local-only, safe to delete): the bot proposes an act every
 * hour — but does APPLYING it actually change the world, or is every command
 * silently refused (which is what "nothing happens" would look like)?
 */
import { initGame, gameTick } from '../src/game/gameEngine';
import { MapSize } from '../src/game/gameTypes';
import { decideVirtualPlayerAction } from '../src/game/virtualPlayer';
import { shouldVirtualPlayerAct } from '../src/hooks/useVirtualPlayer';
import { applyWorkerCommand } from '../src/game/simWorker/commands';

let world = initGame({ size: MapSize.Medium, seed: 4242 });
let lastActedTick: number | null = null;
let acted = 0;
let changed = 0;
const seen = new Map<string, number>();

function signature(w: typeof world): string {
  return `${w.buildings.length}|${w.resources.wood}|${w.resources.stone}|${w.resources.gold}|${w.researchNodes.filter((n) => n.researched).length}`;
}

for (let i = 0; i < 300; i++) {
  world = gameTick(world);
  if (!shouldVirtualPlayerAct(true, world, lastActedTick)) continue;
  lastActedTick = world.tick;
  const decision = decideVirtualPlayerAction(world);
  if (!decision) continue;
  acted++;
  const before = signature(world);
  const after = applyWorkerCommand(world, decision.command);
  const afterSig = signature(after);
  if (afterSig !== before) changed++;
  seen.set(decision.command.op, (seen.get(decision.command.op) ?? 0) + 1);
  if (acted <= 4 || afterSig === before) {
    console.log(`tick ${world.tick} :: ${decision.command.op} :: changed=${afterSig !== before} :: ${decision.reason}`);
  }
  world = after;
}

console.log('---');
console.log(`acted=${acted} commandsThatChangedSomething=${changed}`);
console.log('ops:', [...seen.entries()].map(([op, n]) => `${op}×${n}`).join(', ') || '(none)');
console.log(`final: buildings=${world.buildings.length} wood=${world.resources.wood} stone=${world.resources.stone} gold=${world.resources.gold} tick=${world.tick}`);
