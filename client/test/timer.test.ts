import { describe, expect, test } from 'vitest';
import { formatTime, RunTimer } from '../src/game/timer.ts';

describe('formatTime', () => {
  test.each([
    [61234, '1:01.234'],
    [0, '0:00.000'],
    [999, '0:00.999'],
    [600000, '10:00.000'],
  ])('%i ms is %s', (ms, text) => {
    expect(formatTime(ms)).toBe(text);
  });
});

describe('RunTimer', () => {
  test('adds nothing while waiting', () => {
    const t = new RunTimer();
    t.add(500);
    expect(t.ms).toBe(0);
    expect(t.state).toBe('waiting');
  });

  test('stops at the exit and ignores later frames', () => {
    const t = new RunTimer();
    t.start();
    t.add(1000.4);
    t.stop();
    t.add(5000);
    t.start();
    t.add(5000);
    expect(t.state).toBe('stopped');
    expect(t.timeMs).toBe(1000);
  });

  test('reset returns to waiting at 0', () => {
    const t = new RunTimer();
    t.start();
    t.add(250);
    t.reset();
    expect(t.state).toBe('waiting');
    expect(t.ms).toBe(0);
  });
});
