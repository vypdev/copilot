import { Parser } from 'commonmark';

export type SddReferencePart = Readonly<{ kind: 'text' | 'code'; value: string }>;
export interface SddVisibleReferences {
  readonly destinations: readonly string[];
  readonly parts: readonly SddReferencePart[];
}

/** Pure syntax projection; callers first remove the gate's hidden comments/fences. */
export function readSddVisibleReferences(source: string): SddVisibleReferences {
  const destinations: string[] = [];
  const parts: SddReferencePart[] = [];
  const walker = new Parser().parse(source).walker();
  let event;
  while ((event = walker.next())) {
    const { node, entering } = event;
    if (entering) {
      if (node.type === 'link' || node.type === 'image') destinations.push(node.destination!);
      if (node.type === 'code') parts.push({ kind: 'code', value: node.literal! });
      if (['text', 'html_inline', 'html_block'].includes(node.type)) parts.push({ kind: 'text', value: node.literal! });
      if (node.type === 'softbreak' || node.type === 'linebreak') parts.push({ kind: 'text', value: '\n' });
    } else if (['paragraph', 'heading', 'item'].includes(node.type)) parts.push({ kind: 'text', value: '\n' });
  }
  return { destinations, parts };
}

/** A whole literal link/image/reference definition is illustrative syntax, never an existence grant. */
export function isSddMarkdownLinkExample(value: string): boolean {
  if (!/^!?\[/u.test(value)) return false;
  const document = new Parser().parse(value);
  const paragraph = document.firstChild;
  if (!paragraph) return true; // Valid reference definitions have no rendered block.
  const child = paragraph.firstChild!; // A rendered CommonMark paragraph is nonempty.
  return paragraph.type === 'paragraph' && paragraph === document.lastChild
    && (child.type === 'link' || child.type === 'image') && child === paragraph.lastChild;
}
