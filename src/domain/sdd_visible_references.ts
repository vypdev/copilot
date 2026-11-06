import { Parser } from 'commonmark';
import { projectMarkdownVisibility } from './markdown_visibility';

/** Excludes examples and hidden records from the contract. */
export function visibleSddContract(source: string): string {
  return projectMarkdownVisibility(source).structural.join('\n');
}

export type SddReferencePart = Readonly<{ kind: 'text' | 'code'; value: string }>;
export interface SddVisibleReferences {
  readonly destinations: readonly string[];
  readonly parts: readonly SddReferencePart[];
}

export interface SddTextBlockLocation {
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
}

/** CommonMark supplies block boundaries; callers retain raw table-cell escapes. */
export function readSddTextBlockLocations(source: string): readonly SddTextBlockLocation[] {
  const blocks: SddTextBlockLocation[] = [];
  const walker = new Parser().parse(source).walker();
  let event;
  while ((event = walker.next())) {
    const { node, entering } = event;
    if (entering && ['paragraph', 'heading'].includes(node.type)) {
      // These concrete block nodes always have source positions in CommonMark.
      const [start, end] = node.sourcepos!;
      blocks.push({ startLine: start[0], startColumn: start[1], endLine: end[0] });
    }
  }
  return blocks;
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
