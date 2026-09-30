import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { EntityType, BUILDING_CONFIGS } from '../game/gameEngine';
import { SPECIES_CONFIG } from '../game/gameEngine';
import type { WorldState } from '../game/gameEngine';
import type { ViewState } from '../game/viewState';
import { terrainPaletteHex } from '../game/terrainAtlas';
import { tileTypeAt } from '../game/terrain/terrainGrid';
import { isActiveMoonHowler } from '../game/moonHowler';
import { isPlayerHuman } from '../game/playerHuman';

const W = 152;
const H = 110;

/**
 * Mini-map terrain tints come from the canonical terrain palette
 * (`terrainAtlas.terrainPaletteHex`) rather than a third hand-written table.
 *
 * The local table is why the minimap could never match the map it navigates
 * (audit `visuals-looks.md` D12), and it also needed a `?? default` for types it missed —
 * the palette is exhaustive by construction.
 */

export default function MiniMap({
  worldRef,
  viewRef,
  onNavigate,
}: {
  worldRef: RefObject<WorldState>;
  viewRef: RefObject<ViewState>;
  /** Click-to-navigate: jump the camera to a world coordinate. */
  onNavigate?: (worldX: number, worldY: number) => void;
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
            if (map) {
              const stepX = Math.max(1, Math.floor(map.width / 48));
              const stepY = Math.max(1, Math.floor(map.height / 36));
              const tw = world.width / map.width;
              const th = world.height / map.height;
              for (let ty = 0; ty < map.height; ty += stepY) {
                for (let tx = 0; tx < map.width; tx += stepX) {
                  // Only the type is needed for the tint, so this bulk pass reads `tileTypeAt`
                  // instead of materialising a `TerrainTile` per sampled cell.
                  const type = tileTypeAt(map, tx, ty);
                  if (type === null) continue;
                  ctx.fillStyle = terrainPaletteHex(type);
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
                  if (isActiveMoonHowler(e)) {
                    // Pulsing red dot — a Moon Howler is hunting right now.
                    const pulse = Math.sin(frameCounter.current / 5) > 0 ? 3 : 2;
                    ctx.fillStyle = '#ef4444';
                    ctx.fillRect(sx - pulse, sy - pulse, pulse * 2, pulse * 2);
                  } else {
                    ctx.fillStyle = isLeader ? '#fde047' : (SPECIES_CONFIG[e.type]?.color ?? '#7c6f9a');
                    ctx.fillRect(sx - 1, sy - 1, isLeader ? 3 : 2, isLeader ? 3 : 2);
                  }
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

  /**
   * The keyboard equivalent of "click to go": jump the camera to the village. Leader first (the
   * `villageLeaderId` owner field), otherwise the centroid of the living settlers — the same target
   * the `H` hotkey centres on, so the two agree.
   *
   * The canvas was click-only: no role, no name, no tab stop, so a keyboard user had no way to use
   * the one navigation control on the map (2026-09-20 audit, bug 55 / OPEN-6).
   */
  const navigateToVillage = useCallback(() => {
    const world = worldRef.current;
    if (!world || !onNavigate) return;
    const leader = world.entities.find((e) => e.alive && e.id === world.villageLeaderId);
    if (leader) {
      onNavigate(leader.x, leader.y);
      return;
    }
    const settlers = world.entities.filter(
      (e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e),
    );
    if (settlers.length === 0) return;
    const cx = settlers.reduce((sum, e) => sum + e.x, 0) / settlers.length;
    const cy = settlers.reduce((sum, e) => sum + e.y, 0) / settlers.length;
    onNavigate(cx, cy);
  }, [onNavigate, worldRef]);

  return (
    <div className="minimap-frame pointer-events-auto absolute bottom-4 left-4 overflow-hidden shadow-2xl">
      <div className="flex items-center justify-between border-b border-stone-600/60 bg-stone-900/90 px-2 py-0.5">
        <span className="text-[11px] font-bold tracking-wide text-stone-400">MAP</span>
        <span className="text-[10px] text-stone-600">click · Enter</span>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="block cursor-pointer focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300 focus-visible:outline-none"
        role="button"
        tabIndex={0}
        aria-label="Mini-map — press Enter to centre the camera on your village"
        title="Mini-map — click, or focus and press Enter, to jump the camera"
        onKeyDown={(e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          navigateToVillage();
        }}
        onClick={(e) => {
          const world = worldRef.current;
          if (!world || !onNavigate) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const px = (e.clientX - rect.left) * (W / rect.width);
          const py = (e.clientY - rect.top) * (H / rect.height);
          onNavigate((px / W) * world.width, (py / H) * world.height);
        }}
      />
    </div>
  );
}
