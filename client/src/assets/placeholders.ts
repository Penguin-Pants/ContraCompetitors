import { fromRows, type PixelImage } from '../render/pixelImage.ts';
import { CLOTHING_RAMP, HIGHLIGHT_RAMP, type SheetSpec } from './manifest.ts';

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

const ENEMY_PAL = {
  o: '#0d1018',
  s: '#d9a27a',
  p: '#24262e',
  b: '#15161b',
  g: '#3a3f4a',
  w: '#e8e8e8',
  1: CLOTHING_RAMP[0],
  2: CLOTHING_RAMP[1],
  3: CLOTHING_RAMP[2],
  4: CLOTHING_RAMP[3],
};

// Enemy bodies are 24 x 22 and headless. The head anchor is the collar center.
const ENEMY_TORSO = [
  '..........oooo..........',
  '........oo4ww4oo........',
  '.......o44433444o.......',
  '......o4433223344o......',
  '......o4332112334o......',
  '.....o43321112334o......',
  '.....o3321111233so......',
  '.....os2211111223o......',
  '......s2211111222o......',
  '......o2221112222o......',
  '......o1111111111o......',
  '......oppppppppppo......',
];

const ENEMY_LEGS_A = [
  '......oppppoopppo.......',
  '......opppo..oppo.......',
  '.....oppo....oppo.......',
  '.....oppo.....oppo......',
  '.....obbo.....obbo......',
  '....obbbo.....obbbo.....',
  '....oooo......oooo......',
  '........................',
  '........................',
  '........................',
];

const ENEMY_LEGS_B = [
  '......opppppppppo.......',
  '.......opppppppo........',
  '........oppoppo.........',
  '........oppoppo.........',
  '........obbobbo.........',
  '.......obbbobbbo........',
  '.......oooooooo.........',
  '........................',
  '........................',
  '........................',
];

const SHOOT_TORSO = ENEMY_TORSO.map((row, i) =>
  i === 6 ? '.....o3321111233soggggo.' : i === 7 ? '.....os2211111223oggo...' : row,
);

const ENEMY_DEFEAT = [
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '........................',
  '..........oooo..........',
  '.....ooooo4ww4ooooo.....',
  '....o44433223344433o....',
  '....o33221111112233o....',
  '...os22111111111122so...',
  '...oppppppppppppppppo...',
  '...opppppppppppppppbbo..',
  '....oooooooooooooooooo..',
  '........................',
];

const enemyFrame = (rows: readonly string[]) => fromRows(rows, ENEMY_PAL);
const ANCHOR = { head: { x: 12, y: 1 } };
const DEFEAT_ANCHOR = { head: { x: 12, y: 14 } };

export const WALKER_SHEET: SheetSpec = {
  id: 'walker',
  kind: 'enemy',
  frameW: 24,
  frameH: 22,
  source: {
    type: 'code',
    draw: () => [
      enemyFrame([...ENEMY_TORSO, ...ENEMY_LEGS_A]),
      enemyFrame([...ENEMY_TORSO, ...ENEMY_LEGS_B]),
      enemyFrame(ENEMY_DEFEAT),
    ],
  },
  frames: [ANCHOR, ANCHOR, DEFEAT_ANCHOR],
  animations: {
    walk: { frames: [0, 1], fps: 6, loop: true },
    defeat: { frames: [2], fps: 1, loop: false },
  },
};

export const SHOOTER_SHEET: SheetSpec = {
  id: 'shooter',
  kind: 'enemy',
  frameW: 24,
  frameH: 22,
  source: {
    type: 'code',
    draw: () => [
      enemyFrame([...ENEMY_TORSO, ...ENEMY_LEGS_A]),
      enemyFrame([...ENEMY_TORSO, ...ENEMY_LEGS_B]),
      enemyFrame([...SHOOT_TORSO, ...ENEMY_LEGS_B]),
      enemyFrame(ENEMY_DEFEAT),
    ],
  },
  frames: [ANCHOR, ANCHOR, ANCHOR, DEFEAT_ANCHOR],
  animations: {
    walk: { frames: [0, 1], fps: 5, loop: true },
    shoot: { frames: [2], fps: 1, loop: false },
    defeat: { frames: [3], fps: 1, loop: false },
  },
};

const CASE_ROWS = [
  '....oooooo....',
  '....o....o....',
  'oooooooooooooo',
  'obbbbbbbbbbbbo',
  'obbbbbyybbbbbo',
  'oddddyLLyddddo',
  'obbbbbyybbbbbo',
  'obbbbbbbbbbbbo',
  'obbbbbbbbbbbbo',
  'oddddddddddddo',
  'oooooooooooooo',
];

function briefcase(body: string, label: string) {
  return fromRows(CASE_ROWS, { o: '#0d1018', b: body, d: '#3a2a1a', y: '#e0b53a', L: label });
}

export const BRIEFCASE_SHEET: SheetSpec = {
  id: 'briefcase',
  kind: 'prop',
  frameW: 14,
  frameH: 11,
  source: {
    type: 'code',
    draw: () => [briefcase('#7a4b2a', '#f4f4f4'), briefcase('#2a4b7a', '#7ff4ff')],
  },
  frames: [{}, {}],
  animations: {
    spread: { frames: [0], fps: 1, loop: true },
    laser: { frames: [1], fps: 1, loop: true },
  },
};

/** Projectiles: player bullet (frame 0) and enemy bullet (frame 1). Effects stay code-drawn (RND-6). */
export const BULLETS = {
  player: fromRows(['.yyyw', 'yyyyw', '.yyyw'], { y: '#ffd166', w: '#fff8e0' }),
  enemy: fromRows(['.rr.', 'rwwr', 'rwwr', '.rr.'], { r: '#e5484d', w: '#ffd0d0' }),
};

export const SHEETS = [PLAYER_SHEET, WALKER_SHEET, SHOOTER_SHEET, BRIEFCASE_SHEET] as const;
