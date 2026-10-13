export const SDD_DIFF_LIMITS = Object.freeze({
  characters: 70_000, bytes: 280_000, lines: 2_000, comparisons: 2_000_000,
  sectionTitles: 8, titleCharacters: 120,
});

export type SddStructuralDiff =
  | { readonly state: 'compared'; readonly addedLines: number; readonly removedLines: number;
      readonly sections: readonly string[]; readonly omittedSections: number }
  | { readonly state: 'bounded'; readonly reason: 'characters' | 'bytes' | 'lines' | 'work' };

class ComparisonBudgetExceeded extends Error {}

/** Exact line counts with Hirschberg's linear-memory LCS; every equality consumes bounded work. */
export function compareSddStructure(before: string, after: string): SddStructuralDiff {
  for (const text of [before, after]) {
    if (Buffer.byteLength(text, 'utf8') > SDD_DIFF_LIMITS.bytes) return Object.freeze({ state: 'bounded', reason: 'bytes' });
    if (text.length > SDD_DIFF_LIMITS.characters) return Object.freeze({ state: 'bounded', reason: 'characters' });
  }
  const left = documentLines(before);
  const right = documentLines(after);
  if (left.length > SDD_DIFF_LIMITS.lines || right.length > SDD_DIFF_LIMITS.lines) {
    return Object.freeze({ state: 'bounded', reason: 'lines' });
  }
  const leftMatches = new Uint8Array(left.length);
  const rightMatches = new Uint8Array(right.length);
  let comparisons = 0;
  let common = 0;
  const equal = (a: string, b: string): boolean => {
    if (comparisons === SDD_DIFF_LIMITS.comparisons) throw new ComparisonBudgetExceeded();
    comparisons++;
    return a === b;
  };
  const match = (a: number, b: number) => { leftMatches[a] = 1; rightMatches[b] = 1; common++; };
  const row = (ls: number, le: number, rs: number, re: number, reverse: boolean): Uint16Array => {
    let previous = new Uint16Array(re - rs + 1);
    let current = new Uint16Array(re - rs + 1);
    for (let i = 0; i < le - ls; i++) {
      current[0] = 0;
      for (let j = 1; j <= re - rs; j++) {
        current[j] = equal(left[reverse ? le - i - 1 : ls + i], right[reverse ? re - j : rs + j - 1])
          ? previous[j - 1] + 1 : Math.max(previous[j], current[j - 1]);
      }
      [previous, current] = [current, previous];
    }
    return previous;
  };
  // Row arrays leave scope before recursion; no quadratic trace is retained.
  const split = (ls: number, middle: number, le: number, rs: number, re: number): number => {
    const forward = row(ls, middle, rs, re, false);
    const backward = row(middle, le, rs, re, true);
    let best = -1;
    let offset = 0;
    for (let j = 0; j <= re - rs; j++) {
      const score = forward[j] + backward[re - rs - j];
      if (score > best) { best = score; offset = j; }
    }
    return rs + offset;
  };
  const align = (ls: number, le: number, rs: number, re: number): void => {
    if (ls === le || rs === re) return;
    if (le - ls === 1) {
      for (let j = rs; j < re; j++) if (equal(left[ls], right[j])) { match(ls, j); break; }
      return;
    }
    const middle = ls + Math.floor((le - ls) / 2);
    const rightMiddle = split(ls, middle, le, rs, re);
    align(ls, middle, rs, rightMiddle);
    align(middle, le, rightMiddle, re);
  };
  try {
    let start = 0;
    let leftEnd = left.length;
    let rightEnd = right.length;
    while (start < leftEnd && start < rightEnd && equal(left[start], right[start])) { match(start, start); start++; }
    while (start < leftEnd && start < rightEnd && equal(left[leftEnd - 1], right[rightEnd - 1])) {
      match(--leftEnd, --rightEnd);
    }
    align(start, leftEnd, start, rightEnd);
  } catch (error) {
    if (!(error instanceof ComparisonBudgetExceeded)) throw error;
    return Object.freeze({ state: 'bounded', reason: 'work' });
  }
  const titles = new Set<string>();
  collectChangedSections(right, rightMatches, titles);
  collectChangedSections(left, leftMatches, titles);
  return Object.freeze({ state: 'compared', addedLines: right.length - common, removedLines: left.length - common,
    sections: Object.freeze([...titles].slice(0, SDD_DIFF_LIMITS.sectionTitles).map(boundedTitle)),
    omittedSections: Math.max(0, titles.size - SDD_DIFF_LIMITS.sectionTitles) });
}

/** CRLF and terminal newline markers do not count as added/removed content lines. */
function documentLines(text: string): string[] {
  if (!text) return [];
  const lines = text.split(/\r?\n/u);
  if (text.endsWith('\n')) lines.pop();
  return lines;
}

function collectChangedSections(lines: readonly string[], matches: Uint8Array, titles: Set<string>): void {
  let fence: string | undefined;
  let title: string | undefined;
  for (let index = 0; index < lines.length; index++) {
    const boundary = lines[index].match(/^ {0,3}(`{3,}|~{3,})(.*)$/u);
    if (boundary) {
      if (!fence && (boundary[1][0] !== '`' || !boundary[2].includes('`'))) fence = boundary[1];
      else if (fence && boundary[1][0] === fence[0] && boundary[1].length >= fence.length
        && /^[ \t]*$/u.test(boundary[2])) fence = undefined;
    } else if (!fence) {
      const heading = lines[index].match(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/u);
      if (heading) title = heading[1];
    }
    if (matches[index] === 0 && title) titles.add(title);
  }
}

function boundedTitle(title: string): string {
  let value = title.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, ' ').slice(0, SDD_DIFF_LIMITS.titleCharacters);
  if (/[\uD800-\uDBFF]$/u.test(value)) value = value.slice(0, -1);
  return value;
}
