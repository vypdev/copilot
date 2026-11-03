import { readSddTextBlockLocations, readSddVisibleReferences } from './sdd_visible_references';

// Full namespaces retain their established meaning; a bare technical token has no role by itself.
const TOKEN = /(?<![\p{L}\p{M}\p{N}_-])(?:(?!C\d+-)((?:[A-Za-z][A-Za-z0-9]*-)+))?C\d+(?:(?=[-\u2013\u2014]\s*C?\d+(?:[-\u2013\u2014]\s*C?\d+)*(?![\p{L}\p{M}\p{N}_-]))|(?![\p{L}\p{M}\p{N}_-]))/gu;
const EXPLICIT_REFERENCE = /(?<![\p{L}\p{M}\p{N}_-])(?:cases?|test(?: cases?)?|tests|scenarios?|casos?(?: de prueba)?|pruebas?|escenarios?|references?|referencias?|see|refer to|v\u00e9ase|ver|covered by|covered in)(?![\p{L}\p{M}\p{N}_-])(?:\s+[*_`]*(?:ids?|nos?|numbers?|references?|identificadores|n\u00fameros?)\.?[*_`]*)?(?:\s+(?:include|includes|including|are|such as|son|incluyen|como|por ejemplo))?[\s:*_`[(>#=+\-\u2013\u2014]*$/iu;
const CONTINUATION = /^[\s,;.…\-\u2013\u2014*_`()[\]#]*(?:(?:and|or|to|through|y|o|a|hasta|e)\b[\s,;.…\-\u2013\u2014*_`()[\]#]*)*$/iu;
const CASE_COLUMN = /^(?:cases?(?:[ _-]?ids?| references?)?|test cases?(?: ids?)?|casos?(?: de prueba)?|ids? de casos?|identificadores de casos?)$/iu;

interface Cell {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}
interface Row { readonly cells: readonly Cell[]; readonly hasPipe: boolean }
interface CellRole { readonly start: number; readonly end: number; readonly caseRole: boolean }

/** Unescaped pipes delimit cells, including when the pipe occurs in an inline code span. */
function row(text: string, offset: number): Row {
  const cells: Cell[] = [];
  let start = 0, escaped = false, hasPipe = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '|' && !escaped) {
      cells.push({ text: text.slice(start, index), start: offset + start, end: offset + index });
      start = index + 1;
      hasPipe = true;
    }
    escaped = character === '\\' && !escaped;
  }
  cells.push({ text: text.slice(start), start: offset + start, end: offset + text.length });
  if (hasPipe && cells[0].text.trim() === '') cells.shift();
  if (hasPipe && cells.length && cells[cells.length - 1].text.trim() === '') cells.pop();
  return { cells, hasPipe };
}

function caseColumn(value: string): boolean {
  const label = readSddVisibleReferences(value).parts.map(part => part.value).join('').trim().replace(/\s+/gu, ' ');
  return CASE_COLUMN.test(label);
}

/** CommonMark paragraphs bound the GFM table projection, including nested quote/list blocks. */
function tableCellRoles(source: string): readonly CellRole[] {
  const lines = source.split('\n');
  const offsets: number[] = [];
  let offset = 0;
  for (const line of lines) { offsets.push(offset); offset += line.length + 1; }
  const roles: CellRole[] = [];
  for (const block of readSddTextBlockLocations(source)) {
    const rows: Row[] = [];
    for (let line = block.startLine - 1; line < block.endLine; line++) {
      const raw = lines[line];
      const prefix = line === block.startLine - 1 ? block.startColumn - 1
        : (/^ {0,3}(?:>[ \t]?)+/u.exec(raw)?.[0].length ?? 0);
      rows.push(row(raw.slice(prefix), offsets[line] + prefix));
    }
    let columns: readonly boolean[] | undefined;
    for (let index = 0; index < rows.length; index++) {
      const header = rows[index], separator = rows[index + 1];
      if (separator && (header.hasPipe || separator.hasPipe) && header.cells.length > 0
        && separator.cells.length === header.cells.length && separator.cells.every(cell => /^:?-+:?$/u.test(cell.text.trim()))) {
        columns = header.cells.map(cell => caseColumn(cell.text));
        roles.push(...header.cells.map(cell => ({ start: cell.start, end: cell.end, caseRole: false })));
        index++;
      } else if (columns) {
        // GFM permits missing cells and body rows without outer pipes. Extra cells cannot gain a role.
        const activeColumns = columns;
        roles.push(...header.cells.map((cell, column) => ({ start: cell.start, end: cell.end, caseRole: activeColumns[column] === true })));
      }
    }
  }
  return roles;
}

/** Rendered inline labels/code retain references; link destinations are not case IDs. */
function countReferences(source: string, caseRole: boolean): number {
  const text = readSddVisibleReferences(source).parts.map(part => part.value).join('');
  let previousEnd = 0, previousWasCase = false, count = 0;
  for (const match of text.matchAll(TOKEN)) {
    const gap = text.slice(previousEnd, match.index);
    const reference: boolean = caseRole || EXPLICIT_REFERENCE.test(gap)
      || (previousWasCase && CONTINUATION.test(gap));
    if (!match[1] && reference) count++;
    previousWasCase = Boolean(match[1]) || reference;
    previousEnd = match.index + match[0].length;
  }
  return count;
}

/** Receives the owner's existing hidden/fenced-text projection; never rewrites caller Markdown. */
export function countSddShorthandCaseReferences(visibleSource: string): number {
  const source = visibleSource.replace(/\r\n?/gu, '\n');
  let previousEnd = 0, count = 0;
  for (const cell of tableCellRoles(source)) {
    count += countReferences(source.slice(previousEnd, cell.start), false);
    count += countReferences(source.slice(cell.start, cell.end), cell.caseRole);
    previousEnd = cell.end;
  }
  return count + countReferences(source.slice(previousEnd), false);
}
