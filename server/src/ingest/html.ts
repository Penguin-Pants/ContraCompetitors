import { parse } from 'parse5';
import type { DefaultTreeAdapterTypes as T } from 'parse5';

export type Element = T.Element;
type Node = T.Node;

export function parseHtml(html: string): T.Document {
  return parse(html);
}

function isElement(n: Node): n is Element {
  return 'tagName' in n;
}

export function attr(el: Element, name: string): string | undefined {
  return el.attrs.find((a) => a.name === name)?.value;
}

/** Depth-first walk over elements, with the ancestor chain (nearest first). */
export function walkElements(
  root: Node,
  visit: (el: Element, ancestors: readonly Element[]) => void,
) {
  const stack: { node: Node; ancestors: Element[] }[] = [{ node: root, ancestors: [] }];
  while (stack.length) {
    const { node, ancestors } = stack.pop()!;
    const kids = 'childNodes' in node ? node.childNodes : [];
    let next = ancestors;
    if (isElement(node)) {
      visit(node, ancestors);
      next = [node, ...ancestors];
    }
    // <template> content is a separate fragment.
    const content =
      isElement(node) && node.tagName === 'template' ? (node as T.Template).content.childNodes : [];
    for (let i = kids.length - 1; i >= 0; i--) stack.push({ node: kids[i]!, ancestors: next });
    for (const c of content) stack.push({ node: c, ancestors: next });
  }
}

export function textOf(el: Node): string {
  if ('value' in el && el.nodeName === '#text') return (el as T.TextNode).value;
  if (!('childNodes' in el)) return '';
  return el.childNodes.map(textOf).join(' ');
}
