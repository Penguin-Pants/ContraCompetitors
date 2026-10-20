import { parse } from 'parse5';
import type { DefaultTreeAdapterTypes as T } from 'parse5';

export type Element = T.Element;
type Node = T.Node;

/**
 * parse5 takes time quadratic in nesting depth (each end tag scans the open-element stack), and
 * parsing is synchronous, so a crafted page could block the event loop past the deadline. Real
 * pages nest far less than this.
 */
export const MAX_DEPTH = 2000;
/** No end tag needed (void) or an optional one: these do not add nesting in the estimate. */
const FLAT_TAGS = new Set(
  (
    'area base br col embed hr img input link meta param source track wbr ' +
    'p li dt dd tr td th thead tbody tfoot option optgroup rb rt rtc rp colgroup caption'
  ).split(' '),
);

/**
 * Markup without comments and script and style text, which can hold tag-like strings that are not
 * elements. One forward pass: an unclosed block runs to the end, as in a browser.
 */
function withoutRawText(html: string): string {
  const lower = html.toLowerCase();
  const out: string[] = [];
  let i = 0;
  for (;;) {
    const open = /<!--|<script\b|<style\b/g;
    open.lastIndex = i;
    const m = open.exec(lower);
    if (!m) break;
    out.push(html.slice(i, m.index));
    const close = m[0] === '<!--' ? '-->' : m[0] === '<style' ? '</style' : '</script';
    const end = lower.indexOf(close, m.index + m[0].length);
    if (end < 0) return out.join('');
    i = end + close.length;
  }
  out.push(html.slice(i));
  return out.join('');
}

/** Upper estimate of element nesting depth from the raw markup, in one linear pass. */
export function nestingDepth(html: string): number {
  let depth = 0;
  let max = 0;
  for (const m of withoutRawText(html).matchAll(/<(\/?)([a-zA-Z][\w-]*)[^<>]*?(\/?)>/g)) {
    const name = m[2]!.toLowerCase();
    if (FLAT_TAGS.has(name) || m[3]) continue;
    if (m[1]) depth = Math.max(0, depth - 1);
    else if (++depth > max) max = depth;
  }
  return max;
}

export class TooDeep extends Error {
  override name = 'TooDeep';
}

/** Throws TooDeep for markup nested deeper than MAX_DEPTH. */
export function parseHtml(html: string): T.Document {
  if (nestingDepth(html) > MAX_DEPTH) throw new TooDeep(`nesting over ${MAX_DEPTH}`);
  return parse(html);
}

function isElement(n: Node): n is Element {
  return 'tagName' in n;
}

export function attr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

/**
 * Depth-first walk over elements. `visit` gets the state inherited from the parent element and
 * returns the state for its children (for example "inside an author block"). Iterative and linear:
 * deeply nested pages cannot overflow the stack or cost quadratic time.
 */
export function walkElements<S>(root: Node, init: S, visit: (el: Element, inherited: S) => S) {
  const stack: { node: Node; state: S }[] = [{ node: root, state: init }];
  while (stack.length) {
    const { node, state } = stack.pop()!;
    const kids = 'childNodes' in node ? node.childNodes : [];
    const next = isElement(node) ? visit(node, state) : state;
    // <template> content is a separate fragment.
    const content =
      isElement(node) && node.tagName === 'template' ? (node as T.Template).content.childNodes : [];
    for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i]!, state: next });
    for (const c of content) stack.push({ node: c, state: next });
  }
}

/** Text of a node and its descendants, words joined by spaces. Iterative, like the walk. */
export function textOf(el: Node): string {
  const parts: string[] = [];
  const stack: Node[] = [el];
  while (stack.length) {
    const n = stack.pop()!;
    if ('value' in n && n.nodeName === '#text') parts.push((n as T.TextNode).value);
    else if ('childNodes' in n)
      for (let i = n.childNodes.length - 1; i >= 0; i--) stack.push(n.childNodes[i]!);
  }
  return parts.join(' ');
}
