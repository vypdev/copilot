export const PYTHON_LITERAL_SCAN_LIMIT = 64_000;
export const PYTHON_LITERAL_VALUE_LIMIT = 4_096;
export const PYTHON_LITERAL_LINE_LIMIT = 32;
export const PYTHON_LITERAL_WITNESS_LIMIT = 3;
export const PYTHON_LITERAL_OUTPUT_LIMIT = 2_000;

export interface PythonLiteralWitness {
  readonly patchLine: number;
  readonly basis: 'literal' | 'dedent' | 'dedent+lstrip-LF' | 'lstrip-LF';
  readonly lines: readonly string[];
}

export interface PythonLiteralProjection {
  readonly witnesses: readonly PythonLiteralWitness[];
  readonly unavailable: number;
}

/** Conservative literal-value evidence; never a Python interpreter or writer/execution proof. */
export function projectPythonLiteralWitnesses(patch: string): PythonLiteralProjection {
  if (patch.length > PYTHON_LITERAL_SCAN_LIMIT || !wellFormed(patch)) return { witnesses: [], unavailable: 1 };
  const source = currentDiffText(patch);
  const witnesses: PythonLiteralWitness[] = [];
  let unavailable = 0;
  for (let index = 0; index < source.text.length;) {
    const char = source.text[index];
    if (char === '#') {
      const newline = source.text.indexOf('\n', index);
      if (newline === -1) break;
      index = newline + 1;
      continue;
    }
    if (char !== '"' && char !== "'") { index++; continue; }
    if (/[\p{L}\p{N}_]/u.test(source.text[index - 1] ?? '')) {
      let begin = index;
      while (begin > 0 && index - begin < 3 && /[\p{L}\p{N}_]/u.test(source.text[begin - 1])) begin--;
      const prefix = source.text.slice(begin, index);
      const token = readLiteral(source.text, index);
      unavailable++;
      index = token && skippablePrefix(prefix, source.text.slice(index, token.end))
        ? token.end : nextHunk(source.text, index);
      continue;
    }
    const prefix = source.text.slice(source.text.lastIndexOf('\n', index - 1) + 1, index);
    const token = readLiteral(source.text, index);
    if (!token) { unavailable++; index = nextHunk(source.text, index); continue; }
    const start = index;
    index = token.end;
    if (!token.valid) { unavailable++; continue; }
    if (!token.value.includes('\n')) continue;
    // A standalone quote may close a literal whose opening is absent from this patch.
    if (!/[=(,]\s*$/u.test(prefix)) { unavailable++; index = nextHunk(source.text, index); continue; }
    const projected = applyShownTransforms(token.value, source.text.slice(0, start), source.text.slice(index));
    if (!projected) { unavailable++; continue; }
    index += projected.consumed;
    const lines = projected.value.split('\n');
    if (lines[lines.length - 1] === '') lines.pop();
    if (lines.length > PYTHON_LITERAL_LINE_LIMIT || witnesses.length === PYTHON_LITERAL_WITNESS_LIMIT) {
      unavailable++;
      continue;
    }
    const patchLine = source.displayLines[source.text.slice(0, start).split('\n').length - 1];
    const witness = { patchLine, basis: projected.basis, lines };
    // Reserve space for the bounded unavailable counter; never truncate a statement.
    if (wireProjection({ witnesses: [...witnesses, witness], unavailable: 0 }).length > PYTHON_LITERAL_OUTPUT_LIMIT - 32) {
      unavailable++;
      continue;
    }
    witnesses.push(witness);
  }
  return { witnesses, unavailable };
}

function nextHunk(text: string, index: number): number {
  const boundary = text.indexOf('\0', index);
  return boundary === -1 ? text.length : boundary + 1;
}

function skippablePrefix(prefix: string, token: string): boolean {
  if (/^(?:r|b|u|rb|br)$/iu.test(prefix)) return true;
  if (!/^f$/iu.test(prefix)) return false;
  const width = token.startsWith(token[0].repeat(3)) ? 3 : 1;
  const body = token.slice(width, -width);
  // Skip only an unambiguous lexical f-string subset, never interpolate it.
  return /^(?:[^{}\\]|\\[nrtbfva\\]|\{\{|\}\}|\{[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:![sra])?\})*$/u.test(body);
}
import { createUntrustedContent, renderUntrustedContentVerbatim } from '../../domain/security/untrusted_content';


export function renderPythonLiteralWitnesses(patch: string, origin: string): string {
  const projection = projectPythonLiteralWitnesses(patch);
  if (projection.witnesses.length === 0 && projection.unavailable === 0) return '';
  const text = wireProjection(projection);
  return 'Python literal line witnesses: conditional values only; verify host syntax, bindings and writer transforms. patchLine is patch-local, not a native file line. Not execution evidence.\n'
    + renderUntrustedContentVerbatim({ origin: createUntrustedContent('', origin).origin, text, originalLength: text.length, truncated: false, removedControlCharacters: false });
}

function wireProjection(projection: PythonLiteralProjection): string {
  return JSON.stringify({ unavailable: projection.unavailable, witnesses: projection.witnesses.map(witness => ({
    patchLine: witness.patchLine, basis: witness.basis,
    lines: witness.lines.map((value, index) => ({ line: index + 1, text: value })),
  })) });
}

function currentDiffText(patch: string): { text: string; displayLines: number[] } {
  const lines: string[] = [];
  const displayLines: number[] = [];
  patch.replace(/\r\n?/gu, '\n').split('\n').forEach((line, index) => {
    if (line.startsWith('-')) return;
    if ((line.startsWith('+') && !line.startsWith('+++ ')) || line.startsWith(' ')) lines.push(line.slice(1));
    else lines.push('\0'); // Never concatenate across unknown hunk/fragment boundaries.
    displayLines.push(index + 1);
  });
  return { text: lines.join('\n'), displayLines };
}

function readLiteral(text: string, start: number): { end: number; value: string; valid: boolean } | undefined {
  const quote = text[start];
  const delimiter = text.startsWith(quote.repeat(3), start) ? quote.repeat(3) : quote;
  const escapes = new Map([['n', '\n'], ['t', '\t'], ['b', '\b'], ['f', '\f'], ['v', '\v'], ['a', '\x07'],
    ['\\', '\\'], ['"', '"'], ["'", "'"], ['\n', '']]);
  let value = '';
  let valid = true;
  let index = start + delimiter.length;
  while (index < text.length) {
    if (text[index] === '\0') return undefined;
    if (text.startsWith(delimiter, index)) return { end: index + delimiter.length, value, valid };
    let char = text[index++];
    if (char === '\\') {
      if (index === text.length) return undefined;
      const escape = text[index++];
      const replacement = escapes.get(escape);
      if (replacement !== undefined) char = replacement;
      else if (escape === 'x' || escape === 'u' || escape === 'U') {
        const width = escape === 'x' ? 2 : escape === 'u' ? 4 : 8;
        const digits = text.slice(index, index + width);
        const point = Number.parseInt(digits, 16);
        if (digits.length !== width || !/^[a-f0-9]+$/iu.test(digits) || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)) {
          valid = false;
          char = '';
        } else char = String.fromCodePoint(point);
        index += width;
      } else { valid = false; char = ''; }
    } else if (char === '\n' && delimiter.length === 1) return undefined;
    if (value.length <= PYTHON_LITERAL_VALUE_LIMIT) value += char;
    if (value.length > PYTHON_LITERAL_VALUE_LIMIT) valid = false;
  }
  return undefined;
}

function applyShownTransforms(value: string, before: string, after: string): { value: string; basis: PythonLiteralWitness['basis']; consumed: number } | undefined {
  let basis: PythonLiteralWitness['basis'] = 'literal';
  let remaining = after;
  if (/\btextwrap\.dedent\(\s*$/u.test(before)) {
    const close = /^\s*\)/u.exec(remaining);
    if (!close) return undefined;
    const dedented = dedentAscii(value);
    if (dedented === undefined) return undefined;
    value = dedented;
    basis = 'dedent';
    remaining = remaining.slice(close[0].length);
  }
  const strip = /^\s*\.lstrip\(\s*(?:"\\n"|'\\n')\s*\)/u.exec(remaining);
  if (strip) {
    value = value.replace(/^\n+/u, '');
    basis = basis === 'dedent' ? 'dedent+lstrip-LF' : 'lstrip-LF';
    remaining = remaining.slice(strip[0].length);
  }
  if (/^\s*(?:\.|['"]|\+)/u.test(remaining)) return undefined;
  return { value, basis, consumed: after.length - remaining.length };
}

function dedentAscii(value: string): string | undefined {
  const lines = value.split('\n');
  // Python 3.14 changed non-ASCII blank-line normalization; do not guess a version here.
  if (lines.some(line => line.trim() === '' && /[^ \t]/u.test(line))) return undefined;
  const indents = lines.filter(line => /[^ \t]/u.test(line)).map(line => /^[ \t]*/u.exec(line)![0]);
  let margin = indents[0] ?? '';
  for (const indent of indents) while (!indent.startsWith(margin)) margin = margin.slice(0, -1);
  return lines.map(line => /^[ \t]*$/u.test(line) ? '' : line.slice(margin.length)).join('\n');
}

function wellFormed(value: string): boolean {
  for (const point of value) {
    const code = point.codePointAt(0)!;
    if (code >= 0xd800 && code <= 0xdfff) return false;
  }
  return true;
}
