import { useEffect, useRef, type RefObject } from 'react';
import { EntityType, BUILDING_CONFIGS } from '../game/gameEngine';
import { SPECIES_CONFIG } from '../game/gameEngine';
import type { WorldState } from '../game/gameEngine';
import type { ViewState } from '../game/viewState';
import { TerrainType } from '../game/gameTypes';

const W = 152;
const H = 110;

/** Mini-map terrain tints (readable at tiny scale). */
const TERRAIN_DOT: Partial<Record<TerrainType, string>> = {
  [TerrainType.DeepWater]: '#1e3a5f',
  [TerrainType.ShallowWater]: '#2a5a8c',
  [TerrainType.River]: '#3b82a8',
  [TerrainType.RiverBank]: '#5a7a48',
  [TerrainType.Beach]: '#c4b07a',
  [TerrainType.Grassland]: '#5f8a48',
  [TerrainType.Forest]: '#3d6b32',
  [TerrainType.DarkForest]: '#2a4a24',
  [TerrainType.Hills]: '#8a7a4e',
  [TerrainType.Mountains]: '#6b6560',
  [TerrainType.Rocky]: '#7a746c',
  [TerrainType.Snow]: '#d8e0e8',
};

export default function MiniMap({
  worldRef,
  viewRef,
}: {
  worldRef: RefObject<WorldState>;
  viewRef: RefObject<ViewState>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCounter = useRef(0);

  useEffect(() => {
    let animId = 0;
    const draw = () => {
      frameCounter.current++;
      if (frameCounter.current % 5 === 0) {
        const world = worldRef.current;
        const camera = viewRef.current?.camera;
        const canvas = canvasRef.current;
        if (world && camera && canvas) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = false;
            // Base field
            ctx.fillStyle = '#3d5c34';
            ctx.fillRect(0, 0, W, H);

            const scaleX = W / world.width;
            const scaleY = H / world.height;

            // Coarse terrain sample when map exists
            const map = world.worldMap;
            if (map?.tiles?.length) {
              const stepX = Math.max(1, Math.floor(map.width / 48));
              const stepY = Math.max(1, Math.floor(map.height / 36));
              const tw = world.width / map.width;
              const th = world.height / map.height;
              for (let ty = 0; ty < map.height; ty += stepY) {
                for (let tx = 0; tx < map.width; tx += stepX) {
                  const tile = map.tiles[ty]?.[tx];
                  if (!tile) continue;
                  ctx.fillStyle = TERRAIN_DOT[tile.type] ?? '#5f8a48';
                  const px = tx * tw * scaleX;
                  const py = ty * th * scaleY;
                  ctx.fillRect(px, py, Math.ceil(tw * scaleX * stepX) + 1, Math.ceil(th * scaleY * stepY) + 1);
                }
              }
            }

            let leaderSx = -1;
            let leaderSy = -1;
            for (const e of world.entities) {
              if (!e.alive || e.type === EntityType.Grass) continue;
              const sx = e.x * scaleX;
              const sy = e.y * scaleY;
              if (e.type === EntityType.Tree) {
                ctx.fillStyle = '#14532d';
                ctx.fillRect(sx - 1, sy - 1, 2, 2);
              } else if (e.type === EntityType.Human || e.type === EntityType.Werewolf) {
                const isLeader = world.villageLeaderId === e.id && !e.faction;
                if (isLeader) {
                  leaderSx = sx;
                  leaderSy = sy;
                }
                if (e.type === EntityType.Werewolf) {
                  ctx.fillStyle = isLeader ? '#fde047' : (SPECIES_CONFIG[e.type]?.color ?? '#7c6f9a');
                  ctx.fillRect(sx - 1, sy - 1, isLeader ? 3 : 2, isLeader ? 3 : 2);
                } else {
                  ctx.fillStyle = e.faction === 'rival' ? '#fb923c' : e.faction === 'visitor' ? '#22d3ee' : isLeader ? '#fde047' : '#fbbf24';
                  ctx.fillRect(sx - 1, sy - 1, isLeader ? 3 : 2, isLeader ? 3 : 2);
                }
              } else {
                const speciesCfg = SPECIES_CONFIG[e.type];
                if (!speciesCfg) continue;
                ctx.fillStyle = speciesCfg.color;
                ctx.fillRect(sx - 1, sy - 1, 2, 2);
              }
            }

            // Village head — gold ring so they stand out on the mini-map
            if (leaderSx >= 0) {
              ctx.strokeStyle = '#fbbf24';
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              ctx.arc(leaderSx + 0.5, leaderSy + 0.5, 4, 0, Math.PI * 2);
              ctx.stroke();
              ctx.fillStyle = '#fde047';
              ctx.beginPath();
              ctx.arc(leaderSx + 0.5, leaderSy + 0.5, 1.5, 0, Math.PI * 2);
              ctx.fill();
            }

            for (const b of world.buildings) {
              if (!b.completed) continue;
              const buildingCfg = BUILDING_CONFIGS[b.type];
              if (!buildingCfg) continue;
              const sx = b.x * scaleX;
              const sy = b.y * scaleY;
              ctx.fillStyle = b.faction === 'rival' ? '#6366f1' : buildingCfg.backgroundColor;
              ctx.fillRect(sx - 2, sy - 2, 4, 3);
            }

            // Viewport rectangle
            const camW = (world.width / camera.zoom) * scaleX * 0.5;
            const camH = (world.height / camera.zoom) * scaleY * 0.5;
            const camX = camera.x * scaleX - camW / 2;
            const camY = camera.y * scaleY - camH / 2;
            ctx.strokeStyle = 'rgba(0,0,0,0.55)';
            ctx.lineWidth = 2;
            ctx.strokeRect(camX, camY, camW, camH);
            ctx.strokeStyle = '#fde68a';
            ctx.lineWidth = 1;
            ctx.strokeRect(camX, camY, camW, camH);

            // Inner rim
            ctx.strokeStyle = 'rgba(255,255,255,0.08)';
            ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
          }
        }
      }
      animId = requestAnimationFrame(draw);
    };
    animId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animId);
  }, [worldRef, viewRef]);

  return (
    <div className="minimap-frame pointer-events-auto absolute bottom-4 left-4 overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between border-b border-stone-600/60 bg-stone-900/90 px-2 py-0.5">
        <span className="text-[9px] font-bold tracking-wide text-stone-400">MAP</span>
        <span className="text-[8px] text-stone-600">view</span>
      </div>
      <canvas ref={canvasRef} width={W} height={H} className="block" />
    </div>
  );
}
