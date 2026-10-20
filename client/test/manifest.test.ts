import { describe, expect, test } from 'vitest';
import { sliceFrames } from '../src/assets/loader.ts';
import {
  animationFrame,
  CLOTHING_RAMP,
  HIGHLIGHT_RAMP,
  validateSheet,
  type SheetSpec,
} from '../src/assets/manifest.ts';
import { fromRows, getPixel } from '../src/render/pixelImage.ts';

const enemyFrame = () => fromRows(['.cc.', '.cc.', 'k..k'], { c: CLOTHING_RAMP[1], k: '#101010' });

function enemySpec(overrides: Partial<SheetSpec> = {}): SheetSpec {
  return {
    id: 'walker',
    kind: 'enemy',
    frameW: 4,
    frameH: 3,
    source: { type: 'code', draw: () => [enemyFrame()] },
    frames: [{ head: { x: 2, y: 0 } }],
    animations: { walk: { frames: [0], fps: 8, loop: true } },
    ...overrides,
  };
}

describe('validateSheet', () => {
  test('a valid enemy sheet has no errors', () => {
    expect(validateSheet(enemySpec(), [enemyFrame()])).toEqual([]);
  });

  test('enemy frame without head anchor fails', () => {
    expect(validateSheet(enemySpec({ frames: [{}] }), [enemyFrame()])).toContainEqual(
      expect.stringContaining('missing head anchor'),
    );
  });

  test('head anchor outside the frame fails', () => {
    const spec = enemySpec({ frames: [{ head: { x: 9, y: 0 } }] });
    expect(validateSheet(spec, [enemyFrame()])).toContainEqual(expect.stringContaining('outside'));
  });

  test('enemy sheet with no clothing-ramp pixels fails', () => {
    const plain = fromRows(['kkkk', 'kkkk', 'kkkk'], { k: '#101010' });
    expect(validateSheet(enemySpec(), [plain])).toContainEqual(expect.stringContaining('clothing'));
  });

  test('player sheet needs highlight-ramp pixels', () => {
    const spec = enemySpec({ id: 'player', kind: 'player', frames: [{}] });
    expect(validateSheet(spec, [enemyFrame()])).toContainEqual(
      expect.stringContaining('highlight'),
    );
    const lit = fromRows(['hhhh', 'hhhh', 'hhhh'], { h: HIGHLIGHT_RAMP[2] });
    expect(validateSheet(spec, [lit])).toEqual([]);
  });

  test('frame count, size and animation range are checked', () => {
    const spec = enemySpec({ animations: { walk: { frames: [0, 3], fps: 8, loop: true } } });
    const errors = validateSheet(spec, [enemyFrame(), fromRows(['c'], { c: CLOTHING_RAMP[0] })]);
    expect(errors).toContainEqual(expect.stringContaining('2 frames decoded'));
    expect(errors).toContainEqual(expect.stringContaining('size 1x1'));
    expect(errors).toContainEqual(expect.stringContaining('frame 3 out of range'));
  });
});

test('animationFrame loops or holds the last frame', () => {
  expect(animationFrame({ frames: [4, 5, 6], fps: 10, loop: true }, 350)).toBe(4);
  expect(animationFrame({ frames: [4, 5, 6], fps: 10, loop: false }, 350)).toBe(6);
});

test('sliceFrames cuts a one-row sheet', () => {
  const sheet = fromRows(['rrgg', 'rrgg'], { r: '#ff0000', g: '#00ff00' });
  const frames = sliceFrames(sheet, 2, 2);
  expect(frames).toHaveLength(2);
  expect(getPixel(frames[1]!, 0, 1)).toEqual([0, 255, 0, 255]);
});
