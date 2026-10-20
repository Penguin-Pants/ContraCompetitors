import { describe, expect, test } from 'vitest';
import { extractColors } from '../src/ingest/colors.ts';

describe('extractColors', () => {
  test('--brand-primary wins over frequent colors', () => {
    const css = `
      :root { --brand-primary: #e4002b; --text-color: #222; --bg-light: #fafafa; }
      .btn { background-color: #1e88e5; } .btn:hover { background-color: #1e88e5; }
      a { color: #1e88e5; } header { background: #1e88e5; } nav a { color: #1e88e5 }
    `;
    const colors = extractColors([css]);
    expect(colors[0]).toBe('#e4002b');
    expect(colors[1]).toBe('#1e88e5');
  });

  test('gray-only CSS returns 0 colors', () => {
    const css = `
      :root { --primary: #777777; }
      body { color: #333; background: #fff; } .btn { background-color: #eeeeee; color: #111111 }
      a { color: rgb(120, 120, 120) } header { background: black }
    `;
    expect(extractColors([css])).toEqual([]);
  });

  test('a single brand color returns 1', () => {
    expect(
      extractColors([':root { --color-accent: hsl(150 70% 40%); } body { color: #222 }']),
    ).toHaveLength(1);
  });

  test('bare channel lists in custom properties are understood', () => {
    expect(extractColors([':root { --primary: 220 90% 50%; }'])).toHaveLength(1);
  });

  test('frequency ranks usage colors on buttons, links and headers; other selectors do not count', () => {
    const css = `
      .card { color: #00aa55 } .card2 { color: #00aa55 } .card3 { color: #00aa55 }
      .btn-primary { background-color: #ff6600 } a:hover { color: #ff6600 } h1 { color: #7b1fa2 }
    `;
    expect(extractColors([css])).toEqual(['#ff6600', '#7b1fa2']);
  });

  test('two shades of one color give one pick', () => {
    expect(extractColors([':root { --brand: #1e88e5; --accent: #1f8ae6 }'])).toEqual(['#1e88e5']);
  });

  test('broken CSS does not throw', () => {
    expect(() => extractColors(['a { color: ', '}}}{{{', ':root{--primary:#e4002b'])).not.toThrow();
  });
});
