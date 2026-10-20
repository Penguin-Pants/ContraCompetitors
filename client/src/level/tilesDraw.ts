import { ART_H, ART_W } from '@lr/shared/render';
import type { Camera } from '../render/camera.ts';
import { shade } from '../render/color.ts';
import type { PixelCanvas } from '../render/pixelCanvas.ts';
import { drawText, textWidth } from '../render/pixelFont.ts';
import type { Theme } from '../theme/palette.ts';
import { FLOOR, type Level, type Prop } from './levelData.ts';
import { SOLID, TILE } from './tilemap.ts';
import { zoneAt } from './zones.ts';

const METAL = '#5a6170';
const METAL_DARK = '#3a404c';
const WOOD = '#8a6239';
const CARDBOARD = '#b08752';
const TAPE = '#d9c08f';
const GLASS = '#7fa7c9';
const RUBBER = '#1d1f24';
const OUTLINE = '#0d1018';
const HAZARD = '#e0b53a';

/** Far wall or skyline on L1 with half-speed parallax. */
export function drawFar(p: PixelCanvas, cam: Camera) {
  const SPACING = 48;
  const offset = Math.round(cam.x / 2);
  const first = Math.floor(offset / SPACING);
  for (let n = first; n * SPACING - offset < ART_W; n++) {
    const x = n * SPACING - offset;
    const zone = zoneAt(cam.x + x + SPACING / 2);
    const c = zone.palette.far;
    if (zone.id === 1) {
      p.rect(x, 60, 40, 180, c);
      for (let y = 72; y < 240; y += 28) p.rect(x, y, 40, 3, shade(c, 1.25));
    } else if (zone.id === 2) {
      const h = 50 + (Math.abs(n) % 3) * 22;
      p.rect(x, 240 - h, 46, h, c);
      p.rect(x + 8, 250 - h, 4, 4, shade(zone.palette.glow, 0.55));
    } else {
      p.rect(x, 40, SPACING, 200, c);
      p.rect(x + 20, 40, 2, 200, shade(c, 0.8));
    }
  }
}

function drawTiles(p: PixelCanvas, level: Level, cam: Camera, theme: Theme) {
  const { map } = level;
  const c0 = Math.max(0, Math.floor(cam.x / TILE));
  const c1 = Math.min(map.cols - 1, Math.floor((cam.x + ART_W) / TILE));
  const r1 = Math.min(map.rows - 1, Math.floor((cam.y + ART_H) / TILE));
  for (let tx = c0; tx <= c1; tx++) {
    const pal = zoneAt(tx * TILE).palette;
    for (let ty = 0; ty <= r1; ty++) {
      const t = map.get(tx, ty);
      const x = tx * TILE - cam.x;
      const y = ty * TILE - cam.y;
      if (t === SOLID && ty >= 15) {
        p.rect(x, y, TILE, TILE, pal.floor);
        if (map.get(tx, ty - 1) !== SOLID) {
          p.rect(x, y, TILE, 2, theme.primary);
          p.rect(x, y + 2, TILE, 1, pal.floorEdge);
        }
        if (ty === 16 && tx % 3 === 0) p.rect(x + 5, y + 4, 2, 1, pal.floorEdge);
      }
    }
  }
}

function drawProp(p: PixelCanvas, prop: Prop, cam: Camera, theme: Theme, label: string) {
  const x = prop.x - cam.x;
  const y = prop.y - cam.y;
  const { w, h } = prop;
  const accent = theme.primary;
  const second = theme.secondary;
  switch (prop.kind) {
    case 'pallet':
      p.rect(x, y, w, h, OUTLINE);
      for (let sx = 1; sx < w - 1; sx += 5) p.rect(x + sx, y + 1, 4, 4, WOOD);
      p.rect(x + 1, y + h - 6, w - 2, 5, shade(WOOD, 0.7));
      break;
    case 'boxes':
      for (let by = 0; by < h; by += TILE)
        for (let bx = 0; bx < w; bx += TILE) {
          p.rect(x + bx, y + by, TILE, TILE, OUTLINE);
          p.rect(x + bx + 1, y + by + 1, TILE - 2, TILE - 2, CARDBOARD);
          p.rect(x + bx + 7, y + by + 1, 2, TILE - 2, TAPE);
          p.rect(x + bx + 1, y + by + TILE - 3, TILE - 2, 2, shade(CARDBOARD, 0.75));
        }
      break;
    case 'rack': {
      for (let ux = 0; ux < w; ux += 5 * TILE) p.rect(x + ux, y, 3, h, METAL_DARK);
      p.rect(x + w - 3, y, 3, h, METAL_DARK);
      if (h === TILE) {
        p.rect(x, y, w, 4, accent);
        p.rect(x, y + 4, w, 2, shade(accent, 0.6));
        p.rect(x + 2, y + 6, 2, 10, METAL_DARK);
        p.rect(x + w - 4, y + 6, 2, 10, METAL_DARK);
      } else {
        for (let ry = 0; ry < h; ry += 3 * TILE) {
          p.rect(x, y + ry, w, 4, accent);
          p.rect(x, y + ry + 4, w, 2, shade(accent, 0.6));
        }
      }
      break;
    }
    case 'terminalDoor':
      p.rect(x, y, w, h, METAL);
      p.rect(x + 6, y + 10, w - 12, h - 10, OUTLINE);
      p.rect(x, y, w, 4, accent);
      for (let sy = 14; sy < h; sy += 8) p.rect(x + 6, y + sy, w - 12, 1, METAL_DARK);
      break;
    case 'dock':
      p.rect(x, y, w, h, '#4a4f58');
      p.rect(x, y, w, 3, accent);
      for (let sx = 0; sx < w; sx += 8) p.rect(x + sx, y + 3, 4, 3, HAZARD);
      p.rect(x, y + h - 4, w, 4, shade('#4a4f58', 0.7));
      break;
    case 'container':
      p.rect(x, y, w, h, OUTLINE);
      p.rect(x + 1, y + 1, w - 2, h - 2, second);
      for (let sx = 3; sx < w - 2; sx += 4) p.rect(x + sx, y + 2, 1, h - 4, shade(second, 0.7));
      p.rect(x + 1, y + 1, w - 2, 2, shade(second, 1.3));
      break;
    case 'truckCab':
      p.rect(x, y, w, h, OUTLINE);
      p.rect(x + 1, y + 1, w - 2, h - 8, accent);
      p.rect(x + w - 16, y + 4, 12, 9, GLASS);
      p.rect(x + 1, y + h - 8, w - 2, 4, METAL_DARK);
      p.rect(x + 6, y + h - 6, 10, 6, RUBBER);
      p.rect(x + w - 16, y + h - 6, 10, 6, RUBBER);
      break;
    case 'trailer': {
      const bodyH = 3 * TILE;
      p.rect(x, y, w, bodyH, OUTLINE);
      p.rect(x + 1, y + 1, w - 2, bodyH - 2, '#c9ccd3');
      p.rect(x + 1, y + 1, w - 2, 3, accent);
      for (let sx = 6; sx < w - 2; sx += 6) p.rect(x + sx, y + 5, 1, bodyH - 8, '#a9acb4');
      const ground = FLOOR * TILE - cam.y;
      p.rect(x + 8, y + bodyH, w - 16, 3, METAL_DARK);
      for (const wx of [12, 26, w - 38, w - 24]) {
        p.rect(x + wx + 4, y + bodyH + 3, 2, ground - 10 - (y + bodyH + 3), METAL_DARK);
        p.rect(x + wx, ground - 10, 10, 10, RUBBER);
      }
      break;
    }
    case 'steps':
      p.rect(x, y, w, h, '#4f4b54');
      p.rect(x, y, w, 2, accent);
      p.rect(x, y + 2, w, 1, shade('#4f4b54', 1.3));
      break;
    case 'conveyor':
      p.rect(x, y, w, 5, RUBBER);
      for (let sx = 1; sx < w; sx += 6) p.rect(x + sx, y + 1, 3, 3, '#4a4d55');
      p.rect(x, y + 5, w, 2, accent);
      for (let lx = 4; lx < w; lx += 3 * TILE)
        p.rect(x + lx, y + 7, 3, 240 - prop.y - 7, METAL_DARK);
      break;
    case 'bollard':
      p.rect(x + 4, y, 8, h, HAZARD);
      p.rect(x + 4, y + 5, 8, 3, OUTLINE);
      break;
    case 'shutterDoor': {
      p.rect(x - 4, y - 12, w + 8, h + 12, METAL_DARK);
      p.rect(x, y, w, h, '#a58b5a');
      for (let sy = 2; sy < h; sy += 4) p.rect(x, y + sy, w, 1, '#7a6640');
      const tw = textWidth(label);
      p.rect(x + Math.floor((w - tw) / 2) - 3, y - 10, tw + 6, 9, accent);
      drawText(p, label, x + Math.floor((w - tw) / 2), y - 8, OUTLINE);
      break;
    }
    case 'wall':
      p.rect(x, y, w, h, '#20222c');
      break;
  }
}

export function drawLevel(p: PixelCanvas, level: Level, cam: Camera, theme: Theme) {
  drawTiles(p, level, cam, theme);
  for (const prop of level.props) {
    if (prop.x - 20 > cam.x + ART_W || prop.x + prop.w + 20 < cam.x) continue;
    drawProp(p, prop, cam, theme, level.label);
  }
}
