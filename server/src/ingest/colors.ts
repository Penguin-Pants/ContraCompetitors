import * as csstree from 'css-tree';
import { differenceEuclidean, formatHex, oklch, parse } from 'culori';

const BRAND_VAR = /^--(?:[a-z0-9]+-)*(?:primary|brand|accent|main|theme)(?:-[a-z0-9]+)*$/i;
const NOT_BRAND_VAR =
  /(?:^|-)(?:text|fg|foreground|bg|background|surface|white|black|gray|grey|neutral|border|shadow|light|dark|contrast|muted)(?:-|$)/i;
const BRAND_SELECTOR =
  /(?:^|[\s>+~,(.#:])(?:button|btn[\w-]*|a|link[\w-]*|header|nav[\w-]*|navbar|h1|h2|h3|cta[\w-]*|primary[\w-]*)(?=$|[\s>+~,):.[#])/i;
const USAGE_PROPS = new Set(['color', 'background-color', 'background', 'border-color', 'fill']);
const KEYWORDS = new Set([
  'transparent',
  'inherit',
  'initial',
  'unset',
  'currentcolor',
  'none',
  'revert',
]);
const okDistance = differenceEuclidean('oklab');
/** Two picks closer than this are shades of one color. */
const MIN_PICK_DISTANCE = 0.08;

/** Saturated, not near-white, not near-black. */
export function isBrandish(hex: string): boolean {
  const c = oklch(hex);
  return !!c && c.c >= 0.05 && c.l >= 0.15 && c.l <= 0.93;
}

function toHex(raw: string): string | null {
  const v = raw.trim();
  if (!v || KEYWORDS.has(v.toLowerCase())) return null;
  const candidates = [v];
  // Bare channel lists in custom properties, e.g. `--primary: 220 90% 50%` or `30, 136, 229`.
  if (/^[\d.\s,%/deg-]+$/.test(v)) candidates.push(`hsl(${v})`, `rgb(${v})`);
  for (const c of candidates) {
    const parsed = parse(c);
    if (parsed && (parsed.alpha ?? 1) >= 0.5) return formatHex(parsed) ?? null;
  }
  return null;
}

/** Color literals in a declaration value: hex, color functions and named colors. */
function colorsInValue(value: csstree.CssNode): string[] {
  const out: string[] = [];
  csstree.walk(value, {
    enter(node: csstree.CssNode) {
      if (node.type === 'Hash') {
        const hex = toHex(`#${node.value}`);
        if (hex) out.push(hex);
      } else if (
        node.type === 'Function' &&
        /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/i.test(node.name)
      ) {
        const hex = toHex(csstree.generate(node));
        if (hex) out.push(hex);
        return csstree.walk.skip;
      } else if (node.type === 'Identifier') {
        const hex = toHex(node.name);
        if (hex) out.push(hex);
      }
      return undefined;
    },
  });
  return out;
}

/**
 * ING-3: brand colors from CSS. Brand-named custom properties rank first (earliest first), then
 * saturated colors used on buttons, links and headers, by frequency. Near-white, near-black and
 * gray colors are dropped. Returns 0, 1 or 2 colors as `#rrggbb`.
 */
export function extractColors(cssTexts: readonly string[]): string[] {
  const scores = new Map<string, number>();
  let order = 0;
  const add = (hex: string, score: number) => {
    if (isBrandish(hex)) scores.set(hex, (scores.get(hex) ?? 0) + score);
  };
  for (const text of cssTexts) {
    let ast: csstree.CssNode;
    try {
      ast = csstree.parse(text, { parseCustomProperty: false, onParseError: () => {} });
    } catch {
      continue;
    }
    csstree.walk(ast, {
      visit: 'Rule',
      enter(rule: csstree.Rule) {
        const selector = csstree.generate(rule.prelude);
        const brandSelector = BRAND_SELECTOR.test(selector);
        csstree.walk(rule.block, {
          visit: 'Declaration',
          enter(decl: csstree.Declaration) {
            const prop = decl.property.toLowerCase();
            if (prop.startsWith('--')) {
              if (!BRAND_VAR.test(prop) || NOT_BRAND_VAR.test(prop)) return;
              const raw =
                decl.value.type === 'Raw' ? decl.value.value : csstree.generate(decl.value);
              const hex = toHex(raw);
              if (hex) add(hex, 1000 - Math.min(order++, 500));
            } else if (brandSelector && USAGE_PROPS.has(prop)) {
              for (const hex of colorsInValue(decl.value)) add(hex, 1);
            }
          },
        });
      },
    });
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([hex]) => hex);
  const picks: string[] = [];
  for (const hex of ranked) {
    if (picks.every((p) => okDistance(p, hex) >= MIN_PICK_DISTANCE)) picks.push(hex);
    if (picks.length === 2) break;
  }
  return picks;
}
