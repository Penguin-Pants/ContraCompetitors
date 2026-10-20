import { expect, test, vi } from 'vitest';
import { Loop, MAX_FRAME_MS, STEP_MS } from '../src/engine/loop.ts';
import { Camera } from '../src/render/camera.ts';

function handlers(frozen = () => false) {
  return { update: vi.fn(), frame: vi.fn(), render: vi.fn(), isFrozen: frozen };
}

test('runs fixed steps for the elapsed time and reports real time', () => {
  const h = handlers();
  const loop = new Loop(h);
  loop.tick(STEP_MS * 3 + 1);
  expect(h.update).toHaveBeenCalledTimes(3);
  expect(h.frame).toHaveBeenCalledWith(STEP_MS * 3 + 1);
  expect(h.render).toHaveBeenCalledTimes(1);
});

test('clamps long frames', () => {
  const h = handlers();
  new Loop(h).tick(5000);
  expect(h.update).toHaveBeenCalledTimes(Math.round(MAX_FRAME_MS / STEP_MS));
  expect(h.frame).toHaveBeenCalledWith(MAX_FRAME_MS);
});

test('frozen loop renders but runs no step and adds no time', () => {
  const h = handlers(() => true);
  new Loop(h).tick(100);
  expect(h.update).not.toHaveBeenCalled();
  expect(h.frame).not.toHaveBeenCalled();
  expect(h.render).toHaveBeenCalledTimes(1);
});

test('camera snaps to whole art pixels and clamps to the world', () => {
  const cam = new Camera(2000, 270);
  cam.follow(500.4, 100.7);
  expect(Number.isInteger(cam.x)).toBe(true);
  expect(cam.x).toBe(340);
  cam.follow(-50, 0);
  expect(cam.x).toBe(0);
  cam.follow(5000, 0);
  expect(cam.x).toBe(2000 - 480);
  expect(cam.y).toBe(0);
});

test('a pause during the steps adds no real time for that frame', () => {
  let frozen = false;
  const h = { ...handlers(() => frozen), update: vi.fn(() => (frozen = true)) };
  new Loop(h).tick(STEP_MS * 3);
  expect(h.update).toHaveBeenCalledTimes(1);
  expect(h.frame).not.toHaveBeenCalled();
});
