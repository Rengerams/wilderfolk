/**
 * L3 decor renderer — draws the biome-density-driven ground props baked into
 * `WorldMap.decorations` (Teraforge's L3 layer), ported from Teraforge `render.ts`.
 */
import type { RenderSnapshot } from '../renderSnapshot';
import type { SpriteType } from '../terrain/biomes';

interface DecorItem {
  x: number; y: number; type: SpriteType; scale: number; variant: number; flipX: boolean; tint?: number;
}

/** Draw one decorative ground prop (no trees — those are Wilderfolk entities). */
function drawProp(ctx: CanvasRenderingContext2D, d: DecorItem, s: number, v: number, flipX: boolean) {
  // Props draw around the origin; the caller translates/scales to the decor's screen position.
  const x = 0, y = 0;
  ctx.save();
  // Teraforge varies each L3 prop's brightness so a dense field of one shape does not read as a
  // stamped pattern. The generator's tint is a −1…1 offset, so ±1 is at most ±18 % brightness.
  const tint = d.tint ?? 0;
  const prevFilter = ctx.filter;
  if (tint !== 0) ctx.filter = `brightness(${(1 + tint * 0.18).toFixed(3)})`;
  if (flipX) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
  switch (d.type) {
    case 'rock_small': {
      const r = 4.5 * s;
      ctx.fillStyle = '#8a8780';
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x - r * 0.5, y - r); ctx.lineTo(x + r * 0.6, y - r * 0.8); ctx.lineTo(x + r, y); ctx.closePath(); ctx.fill();
      break;
    }
    case 'rock_big': {
      const r = 10 * s;
      ctx.fillStyle = 'rgba(24,36,20,0.18)'; ctx.beginPath(); ctx.ellipse(x + r * 0.3, y + 2, r * 0.65, r * 0.22, 0, 0, 6.284); ctx.fill();
      ctx.fillStyle = '#94918a';
      ctx.beginPath(); ctx.moveTo(x - r, y); ctx.lineTo(x - r * 0.5, y - r * 0.85); ctx.lineTo(x + r * 0.2, y - r); ctx.lineTo(x + r, y - r * 0.35); ctx.lineTo(x + r * 0.8, y); ctx.closePath(); ctx.fill();
      break;
    }
    case 'stump':
      ctx.fillStyle = '#7a5b3a'; ctx.beginPath(); ctx.ellipse(x, y, 3.5 * s, 2.4 * s, 0, 0, 6.284); ctx.fill();
      break;
    case 'flower': {
      ctx.strokeStyle = '#4a8a32'; ctx.lineWidth = 1.2 * s;
      for (let i = -1; i <= 1; i++) {
        const fx = x + i * 3 * s, bend = i * 1.8;
        ctx.beginPath(); ctx.moveTo(fx, y); ctx.quadraticCurveTo(fx + bend * 0.4 * s, y - 10 * s, fx + bend, y - 18 * s); ctx.stroke();
      }
      ctx.fillStyle = v % 2 === 0 ? '#f2d06b' : '#e8748c';
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * 6.284;
        ctx.beginPath(); ctx.arc(x + Math.cos(a) * 2.2 * s, y - 18 * s + Math.sin(a) * 2.2 * s, 1.6 * s, 0, 6.284); ctx.fill();
      }
      ctx.fillStyle = '#e0a040'; ctx.beginPath(); ctx.arc(x, y - 18 * s, 0.9 * s, 0, 6.284); ctx.fill();
      break;
    }
    case 'bush': {
      ctx.fillStyle = 'rgba(20,35,15,0.18)'; ctx.beginPath(); ctx.ellipse(x, y, 8 * s, 3 * s, 0, 0, 6.284); ctx.fill();
      const layers = ['#38742e', '#408435', '#489040'];
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = layers[i];
        ctx.beginPath(); ctx.arc(x + (i - 1) * 6 * s, y - 5 * s - (i % 2) * 2 * s, (6 - i) * s, 0, 6.284); ctx.fill();
      }
      break;
    }
    case 'tallgrass': {
      const blades = 4 + (v % 3);
      for (let i = 0; i < blades; i++) {
        const bx = x + (i - blades / 2) * 2.2 * s;
        const lean = (((v + i) % 5) - 2) * 1.5 * s;
        const h2 = 5 * s + ((v + i) % 4) * 1.5 * s;
        ctx.strokeStyle = (v + i) % 3 === 0 ? '#5a9a38' : (v + i) % 3 === 1 ? '#4a8830' : '#6aaa42';
        ctx.lineWidth = 0.8 * s;
        ctx.beginPath(); ctx.moveTo(bx, y); ctx.quadraticCurveTo(bx + lean * 0.4, y - h2 * 0.5, bx + lean, y - h2); ctx.stroke();
      }
      break;
    }
    case 'fern': {
      ctx.strokeStyle = v % 2 === 0 ? '#3d8a2e' : '#4a9a38'; ctx.lineWidth = 0.9 * s;
      const fronds = 4 + (v % 3);
      for (let i = 0; i < fronds; i++) {
        const angle = (i / fronds) * 3.14 - 1.57 + (v % 7) * 0.15;
        const len = 6 * s + (i % 3) * 2 * s;
        ctx.beginPath(); ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + Math.cos(angle) * len * 0.5, y - len * 0.3, x + Math.cos(angle) * len, y - len * 0.7); ctx.stroke();
      }
      break;
    }
    case 'berries': {
      ctx.fillStyle = '#3a7828';
      ctx.beginPath(); ctx.arc(x, y - 3 * s, 4 * s, 0, 6.284); ctx.arc(x + 3 * s, y - 2 * s, 3 * s, 0, 6.284); ctx.fill();
      ctx.fillStyle = v % 3 === 0 ? '#c83030' : v % 3 === 1 ? '#3040b0' : '#8828a0';
      for (let i = 0; i < 4; i++) {
        ctx.beginPath(); ctx.arc(x - 2 * s + ((v + i * 7) % 6) * s, y - 4 * s + ((v + i * 3) % 4) * s, 1.2 * s, 0, 6.284); ctx.fill();
      }
      break;
    }
    case 'mushroom': {
      ctx.fillStyle = '#c4a873'; ctx.fillRect(x - 1.1 * s, y - 2.8 * s, 2.2 * s, 3 * s);
      ctx.fillStyle = v % 3 === 0 ? '#c24a3a' : v % 3 === 1 ? '#d4a040' : '#e8c868';
      ctx.beginPath(); ctx.arc(x, y - 3.5 * s, 3.2 * s, Math.PI, 0); ctx.fill();
      break;
    }
    case 'log': {
      const len = 12 * s, th = 2.8 * s;
      ctx.save(); ctx.translate(x, y); ctx.rotate((v % 6) * 0.5);
      ctx.fillStyle = '#6b5030'; ctx.beginPath(); ctx.roundRect(-len / 2, -th, len, th * 2, th); ctx.fill();
      ctx.fillStyle = '#5a4228'; ctx.beginPath(); ctx.ellipse(-len / 2, 0, th, th, 0, 0, 6.284); ctx.fill();
      ctx.restore();
      break;
    }
    case 'reed':
      ctx.strokeStyle = '#5d7a3c'; ctx.lineWidth = 1.2 * s; ctx.beginPath();
      for (let i = -1; i <= 1; i++) { ctx.moveTo(x + i * 2.2 * s, y); ctx.quadraticCurveTo(x + i * 2.8 * s, y - 4.5 * s, x + i * 4 * s, y - 9 * s); }
      ctx.stroke();
      break;
    case 'cattail': {
      ctx.strokeStyle = '#5d7a3c'; ctx.lineWidth = 1 * s;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + s, y - 8 * s, x + 2 * s, y - 14 * s); ctx.stroke();
      ctx.fillStyle = '#7a5830'; ctx.beginPath(); ctx.roundRect(x + s, y - 14 * s, 2.2 * s, 5 * s, 1.1 * s); ctx.fill();
      break;
    }
    case 'scrub': {
      const twigs = 3 + v % 3;
      ctx.strokeStyle = '#7a7060'; ctx.lineWidth = 0.7 * s;
      for (let i = 0; i < twigs; i++) {
        const tx = x + (i - twigs / 2) * 3 * s;
        const angle = ((v + i * 3) % 7 - 3) * 0.3;
        const h2 = 4 * s + (v + i) % 3 * 2 * s;
        ctx.beginPath(); ctx.moveTo(tx, y); ctx.lineTo(tx + Math.sin(angle) * h2 * 0.4, y - h2); ctx.stroke();
      }
      break;
    }
    case 'lilypad': {
      ctx.fillStyle = 'rgba(60,120,55,0.75)';
      ctx.beginPath(); ctx.arc(x, y, 4 * s, 0.3 + v * 0.1, 5.9 + v * 0.1); ctx.lineTo(x, y); ctx.closePath(); ctx.fill();
      break;
    }
    case 'bones': {
      ctx.strokeStyle = '#d8d0c0'; ctx.lineWidth = 1.5 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 4 * s, y - 2 * s); ctx.lineTo(x + 4 * s, y + 2 * s);
      ctx.moveTo(x + 4 * s, y - 2 * s); ctx.lineTo(x - 4 * s, y + 2 * s); ctx.stroke();
      break;
    }
    case 'driftwood': {
      ctx.strokeStyle = '#9a8868'; ctx.lineWidth = 2 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 5 * s, y); ctx.quadraticCurveTo(x, y - 2 * s, x + 5 * s, y + s); ctx.stroke();
      break;
    }
    case 'cactus': {
      ctx.fillStyle = '#4e8a4a'; ctx.beginPath(); ctx.roundRect(x - 2.2 * s, y - 13 * s, 4.4 * s, 13 * s, 2.2 * s); ctx.fill();
      ctx.beginPath(); ctx.roundRect(x + 2 * s, y - 10 * s, 3.5 * s, 2.5 * s, 1.2 * s); ctx.roundRect(x + 4.5 * s, y - 10.5 * s, 2.5 * s, 5.5 * s, 1.2 * s); ctx.fill();
      break;
    }
    case 'dirt_patch': {
      ctx.save(); ctx.translate(x, y); ctx.rotate((v % 5) * 0.6);
      ctx.fillStyle = 'rgba(140,115,75,0.35)';
      ctx.beginPath(); ctx.ellipse(0, 0, 8 * s, 4 * s, 0, 0, 6.284); ctx.fill();
      ctx.restore();
      break;
    }
    default: break;
  }
  ctx.filter = prevFilter;
  ctx.restore();
}

/** Draw the baked L3 decor props for the visible viewport. */
export function drawDecorProps(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const dec = state.worldMap?.decorations;
  if (!dec || dec.length === 0 || state.camera.zoom < 0.35) return;
  const cam = state.camera;
  for (const d of dec) {
    const sx = (d.x - cam.x) * cam.zoom + cw / 2;
    const sy = (d.y - cam.y) * cam.zoom + ch / 2;
    if (sx < -40 || sx > cw + 40 || sy < -40 || sy > ch + 40) continue;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.scale(cam.zoom, cam.zoom);
    drawProp(ctx, d, d.scale, d.variant, d.flipX);
    ctx.restore();
  }
}
