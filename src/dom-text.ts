import type { CheerioAPI } from "cheerio";

/**
 * Visible text nodes in document order, excluding head/style/script.
 *
 * Iterative on purpose: emails nest tables inside tables, and the recursive
 * `$.root().clone()` + `.text()` this replaces both allocated a second copy of
 * the DOM and bounded how deep a document the analyzers could handle.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function visibleTextNodes($: CheerioAPI): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodes: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stack: any[] = [...($.root()[0]?.children ?? [])].reverse();

  while (stack.length > 0) {
    const node = stack.pop();
    const tag = (node.tagName as string | undefined)?.toLowerCase();
    if (tag === "style" || tag === "script" || tag === "head") continue;
    if (node.type === "text") {
      nodes.push(node);
      continue;
    }
    const children = node.children ?? [];
    for (let i = children.length - 1; i >= 0; i--) stack.push(children[i]);
  }
  return nodes;
}
