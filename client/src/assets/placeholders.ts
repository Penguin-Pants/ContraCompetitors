import { fromRows, type PixelImage } from '../render/pixelImage.ts';
import { HIGHLIGHT_RAMP, type SheetSpec } from './manifest.ts';

/**
 * Code-drawn placeholder art that follows the sprite contract. Phase 10 replaces the character
 * and prop sheets with committed Sprite Fusion PNGs.
 */
const PLAYER_PAL = {
  o: '#0d1018',
  s: '#e0ac7e',
  h: '#3b2a1e',
  k: '#2a2f3a',
  b: '#20232b',
  g: '#6b7080',
  1: HIGHLIGHT_RAMP[0],
  2: HIGHLIGHT_RAMP[1],
  3: HIGHLIGHT_RAMP[2],
  4: HIGHLIGHT_RAMP[3],
};

const PLAYER_TOP = [
  '.....oooooo.....',
  '....ohhhhhho....',
  '....ohhhhhho....',
  '....ossssss.....',
  '....os.ss.so....',
  '....ossssss.....',
  '.....ossss......',
  '......oss.......',
  '....o444444o....',
  '...o43333334o...',
  '...o32222223o...',
  '...o32111123ogg.',
  '...o32111123ogg.',
  '...os322223so...',
  '....s322223s....',
  '....o322223o....',
  '....ob3223bo....',
  '....okkkkkko....',
  '....okkkkkko....',
];

const LEGS_STAND = [
  '....okkookko....',
  '....okko.kko....',
  '....okko.kko....',
  '....okko.kko....',
  '....okko.kko....',
  '....okko.kko....',
  '....okko.kko....',
  '....obbo.bbo....',
  '...obbbo.bbbo...',
  '...oooo..oooo...',
  '................',
  '................',
  '................',
];

const LEGS_RUN_A = [
  '....okkookko....',
  '...okko...kko...',
  '...okko...kko...',
  '..okko.....kko..',
  '..okko.....kko..',
  '.okko.......kko.',
  '.okko.......kko.',
  '.obbo.......obbo',
  'obbbo.......obbo',
  'oooo.........ooo',
  '................',
  '................',
  '................',
];

const LEGS_RUN_B = [
  '....okkookko....',
  '.....okkkko.....',
  '.....okkkko.....',
  '.....okkkko.....',
  '.....okkoo......',
  '.....okko.......',
  '.....okko.......',
  '.....obbo.......',
  '....obbbo.......',
  '....oooo........',
  '................',
  '................',
  '................',
];

const LEGS_JUMP = [
  '....okkookko....',
  '...okko..okko...',
  '..okko....okko..',
  '..okko....okko..',
  '..obbo....obbo..',
  '..oooo....oooo..',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
];

const playerFrame = (legs: readonly string[]): PixelImage =>
  fromRows([...PLAYER_TOP, ...legs], PLAYER_PAL);

export const PLAYER_SHEET: SheetSpec = {
  id: 'player',
  kind: 'player',
  frameW: 16,
  frameH: 32,
  source: {
    type: 'code',
    draw: () => [LEGS_STAND, LEGS_RUN_A, LEGS_RUN_B, LEGS_JUMP].map(playerFrame),
  },
  frames: [{}, {}, {}, {}],
  animations: {
    idle: { frames: [0], fps: 1, loop: true },
    run: { frames: [1, 0, 2, 0], fps: 10, loop: true },
    jump: { frames: [3], fps: 1, loop: false },
  },
};
