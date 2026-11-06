import { Parser } from 'commonmark';

const HTML_COMMENT_START = '<!--';
const HTML_COMMENT_END = '-->';

/** Markdown structure and comment-free field values share the same source lines. */
export function projectMarkdownVisibility(source: string): {
  structural: string[]; uncommented: string[]; codeLines: ReadonlySet<number>;
} {
  const endings = source.match(/\r\n?|\n/gu) ?? [];
  const normalized = source.replace(/\r\n?/gu, '\n');
  const lines = normalized.split('\n');
  let lineStart = 0;
  const starts = lines.map(line => {
    const start = lineStart;
    lineStart += line.length + 1;
    return start;
  });
  const { examples, literalOpeners } = readCodeLocations(normalized, starts);
  let comment = false;
  const structural: string[] = [];
  const uncommented: string[] = [];
  for (const [index, line] of lines.entries()) {
    const ending = endings[index] ?? '';
    if (!comment && examples.has(index + 1)) {
      structural.push('');
      uncommented.push(line + ending);
      continue;
    }
    let visible = '';
    let fieldValue = '';
    let offset = 0;
    while (offset < line.length) {
      const marker = comment ? HTML_COMMENT_END : HTML_COMMENT_START;
      const next = line.indexOf(marker, offset);
      const literal = !comment && next >= 0 && (literalOpeners.has(starts[index] + next) || isEscaped(line, next));
      const stop = next < 0 ? line.length : literal ? next + marker.length : next;
      if (!comment) {
        const text = line.slice(offset, stop);
        visible += text;
        fieldValue += text;
      }
      if (next < 0) break;
      if (!literal) {
        if (!comment) visible += ' ';
        comment = !comment;
      }
      offset = next + marker.length;
    }
    structural.push(visible);
    uncommented.push(fieldValue + (comment ? '' : ending));
  }
  return { structural, uncommented, codeLines: examples };
}

function readCodeLocations(source: string, starts: readonly number[]) {
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
