import fs from 'node:fs';
const graph = JSON.parse(fs.readFileSync('docs/_current_dependency_graph.json', 'utf8'));
const cycleNodes = new Set([
  ...['src/game/adjacencyIndex.ts','src/game/beautyGrid.ts','src/game/challenges.ts','src/game/dayCycle.ts','src/game/defenseStructures.ts','src/game/ecologyStage.ts','src/game/ecosystemPressure.ts','src/game/entityIndex.ts','src/game/eventLog.ts','src/game/forge.ts','src/game/gameTypes.ts','src/game/grassEcology.ts','src/game/humanChat.ts','src/game/juiceEffects.ts','src/game/moonHowler.ts','src/game/playerHuman.ts','src/game/scentGrid.ts','src/game/simEffects.ts','src/game/simFocus.ts','src/game/skills.ts','src/game/spatialGrid.ts','src/game/stats.ts','src/game/workSchedule.ts','src/game/workforce.ts'],
  ...['src/game/economy.ts','src/game/townHall.ts','src/game/tradeCaravans.ts'],
]);
const result = [];
for (const module of graph.modules) {
  if (!cycleNodes.has(module.source)) continue;
  for (const dep of module.dependencies) {
    if (!cycleNodes.has(dep.resolved)) continue;
    if (dep.dependencyTypes.includes('type-only') && !dep.dependencyTypes.includes('import')) result.push({ source: module.source, target: dep.resolved, dependencyTypes: dep.dependencyTypes });
  }
}
console.log(JSON.stringify(result, null, 2));
