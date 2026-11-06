import { Parser } from 'commonmark';

const HTML_COMMENT_START = '<!--';
const HTML_COMMENT_END = '-->';

/** Excludes examples and hidden records from the contract, preserving source line numbers. */
export function visibleSddContract(source: string): string {
  const normalized = source.replace(/\r\n?/gu, '\n');
  const lines = normalized.split('\n');
  let lineStart = 0;
  const starts = lines.map(line => {
    const start = lineStart;
    lineStart += line.length + 1;
    return start;
  });
  const { examples, literalOpeners } = readSddExampleLocations(normalized, starts);
  let comment = false;
  return lines.map((line, index) => {
    if (!comment && examples.has(index + 1)) return '';
    let result = '';
    let offset = 0;
    while (offset < line.length) {
      const marker = comment ? HTML_COMMENT_END : HTML_COMMENT_START;
      const next = line.indexOf(marker, offset);
      if (next < 0) return result + (comment ? '' : line.slice(offset));
      if (!comment && (literalOpeners.has(starts[index] + next) || isEscaped(line, next))) {
        result += line.slice(offset, next + marker.length);
      } else {
        if (!comment) result += line.slice(offset, next) + ' ';
        comment = !comment;
      }
      offset = next + marker.length;
    }
    return result;
  }).join('\n');
}

function readSddExampleLocations(source: string, starts: readonly number[]) {
  const examples = new Set<number>();
  const literalOpeners = new Set<number>();
  const walker = new Parser().parse(source).walker();
  let inlineBlock: readonly [number, number] | undefined;
  let hasLiteralOpener = false;
  let event;
  while ((event = walker.next())) {
    const { node, entering } = event;
    if (node.type === 'code_block' && entering) {
      const [start, end] = node.sourcepos!;
      for (let line = start[0]; line <= end[0]; line++) examples.add(line);
    }
    if (node.type === 'paragraph' || node.type === 'heading') {
      if (entering) {
        const [start, end] = node.sourcepos!;
        inlineBlock = [starts[start[0] - 1], starts[end[0]] ?? source.length];
        hasLiteralOpener = false;
      } else if (hasLiteralOpener && inlineBlock) {
        const [start, end] = inlineBlock;
        for (const marker of inlineCodeCommentOffsets(source.slice(start, end))) literalOpeners.add(start + marker);
      }
    }
    if (node.type === 'code' && entering && node.literal!.includes(HTML_COMMENT_START)) hasLiteralOpener = true;
  }
  return { examples, literalOpeners };
}

/** CommonMark gives block positions only. Match inline runs of equal length within that block. */
function inlineCodeCommentOffsets(block: string): number[] {
  const tokens = [...block.matchAll(/`+|<!--/gu)];
  const nextByLength = new Map<number, number>();
  const closers = new Map<number, number>();
  for (let index = tokens.length - 1; index >= 0; index--) {
    const token = tokens[index];
    const [run] = token;
    if (run === HTML_COMMENT_START) continue;
    const openingLength = isEscaped(block, token.index) ? run.length - 1 : run.length;
    const closingEnd = nextByLength.get(openingLength);
    if (closingEnd !== undefined) closers.set(token.index, closingEnd);
    nextByLength.set(run.length, token.index + run.length);
  }
  const markers: number[] = [];
  let codeUntil = -1;
  let skipUntil = -1;
  for (const token of tokens) {
    if (token.index < skipUntil) continue;
    if (token[0] === HTML_COMMENT_START) {
      if (token.index < codeUntil) markers.push(token.index);
      else if (!isEscaped(block, token.index)) {
        const close = block.indexOf(HTML_COMMENT_END, token.index + HTML_COMMENT_START.length);
        skipUntil = close === -1 ? block.length : close + HTML_COMMENT_END.length;
      }
    } else if (token.index >= codeUntil) {
      codeUntil = closers.get(token.index) ?? codeUntil;
    }
  }
  return markers;
}

function isEscaped(text: string, index: number): boolean {
  let backslashes = 0;
  while (index > 0 && text[--index] === '\\') backslashes++;
  return backslashes % 2 !== 0;
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
