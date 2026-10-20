import { describe, expect, test, vi } from 'vitest';
import { actionForCode, Input } from '../src/engine/input.ts';

function key(code: string, repeat = false) {
  return { code, repeat, preventDefault: vi.fn() };
}

describe('actionForCode', () => {
  test.each([
    ['KeyA', 'left'],
    ['KeyD', 'right'],
    ['KeyW', 'jump'],
    ['KeyS', 'drop'],
    ['Space', 'fire'],
    ['Escape', 'pause'],
  ])('%s maps to %s', (code, action) => {
    expect(actionForCode(code)).toBe(action);
  });

  test.each(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'KeyQ'])(
    '%s maps to nothing',
    (code) => {
      expect(actionForCode(code)).toBeNull();
    },
  );
});

describe('Input', () => {
  test('arrow keys do not hold or press any action', () => {
    const input = new Input();
    for (const code of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])
      input.onKeyDown(key(code));
    expect(input.takePresses()).toEqual([]);
    expect(['left', 'right', 'jump', 'drop'].some((a) => input.isHeld(a as never))).toBe(false);
  });

  test('Space calls preventDefault', () => {
    const input = new Input();
    const e = key('Space');
    input.onKeyDown(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(input.isHeld('fire')).toBe(true);
  });

  test('key repeat does not queue a second press', () => {
    const input = new Input();
    input.onKeyDown(key('KeyW'));
    input.onKeyDown(key('KeyW', true));
    expect(input.takePresses()).toEqual(['jump']);
  });

  test('keyup releases and clear drops held keys', () => {
    const input = new Input();
    input.onKeyDown(key('KeyA'));
    input.onKeyDown(key('KeyD'));
    input.onKeyUp(key('KeyA'));
    expect(input.isHeld('left')).toBe(false);
    expect(input.isHeld('right')).toBe(true);
    input.clear();
    expect(input.isHeld('right')).toBe(false);
  });

  test('disabled input ignores keys', () => {
    const input = new Input();
    input.enabled = false;
    input.onKeyDown(key('KeyA'));
    expect(input.isHeld('left')).toBe(false);
  });

  test('keys pressed while the narrow guard blocks input never reach play after it closes', () => {
    const input = new Input();
    input.onKeyDown(key('KeyA'));
    input.setBlocked(true);
    expect(input.isHeld('left')).toBe(false);
    input.onKeyDown(key('KeyD'));
    input.onKeyDown(key('KeyW'));
    input.setBlocked(false);
    expect(input.isHeld('right')).toBe(false);
    expect(input.takePresses()).toEqual([]);
    input.onKeyDown(key('KeyD'));
    expect(input.takePresses()).toEqual(['right']);
  });
});
