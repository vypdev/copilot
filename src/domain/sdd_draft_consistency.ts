import { SddDraftFormatFailure } from './pre_branch_sdd';

export type SddConsistencyReason = 'case-identity' | 'case-budget' | 'requirement-mapping' | 'repository-path';
export interface SddOwnerDocument { readonly path: string; readonly markdown: string }
export interface SddRepositoryInventory { readonly files: ReadonlySet<string>; readonly directories: ReadonlySet<string>; readonly blocked: ReadonlySet<string> }

const CASE = /\b(?:[A-Za-z][A-Za-z0-9]*-)+C\d+\b/gu;
const CASE_ID = /^(?:[A-Za-z][A-Za-z0-9]*-)+C\d+$/u;
const REQUIREMENT_ID = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+$/u;

/** Generated candidates use visible tables; retained legacy owners are never reformatted. */
export const SDD_CONSISTENCY_PROMPT = `Consistency contract for the proposed draft/appendix (not the retained owner):
In section 4 include one table: Requirement | Behavior. Give every goal a stable requirement ID.
In section 14 include one budget table: Area | Minimum distinct cases | Behaviors/risks covered; positive integers and one Total.
Also in section 14 include one inventory table: Case ID | Area | Requirements | Scenario.
Each row is one distinct executable case with a fully qualified ID such as capability-change-C01, one exact budget area, comma-separated requirement IDs and an observable scenario. Never use shorthand C01, ranges or redefine an ID found in any owning SDD. Reference retained baseline cases in prose using their full IDs; count only the new inventory.
In section 17 include one table: Requirement | Cases. List comma-separated full case IDs for every requirement. Its links must exactly match the case inventory in both directions, with no undefined or generic documentation checks.
In section 15 include one table: Path | Change. Change is update, reference or create. Include the selected SDD path itself with update for an existing SDD or create for a new/companion SDD. Use existing immutable-base files for update/reference. Only explicitly proposed new files may use create; never mark a missing current document as an existing artifact. Cite repository files as full repository-relative paths in backticks, or relative Markdown file links. Put every planned new file in this table. These tables are publication consistency checks, not runtime/security acceptance.`;

const BUDGET_SLOT = '{{SDD_CASE_BUDGET}}';
const TRACEABILITY_SLOT = '{{SDD_REQUIREMENT_CASES}}';

/** The provider writes definitions once; trusted code renders their two redundant projections. */
export const SDD_DERIVED_TABLES_PROMPT = `Draft assembly: the consistency contract above describes the final document. In your raw Markdown, write the complete Requirement | Behavior table in section 4 and Case ID | Area | Requirements | Scenario inventory in section 14. Preserve every resolved minimum, per-area allocation and observable case as actual inventory rows, never ranges or summaries. Instead of independently writing the budget table, put ${BUDGET_SLOT} once on its own visible line in section 14. Instead of writing the reverse Requirement | Cases table, put ${TRACEABILITY_SLOT} once on its own visible line in section 17. Do not include either derived table yourself or put these slots in examples, fences or comments. Trusted code derives exact counts, Total and reciprocal links from your unchanged definitions, then runs every publication check. The compact character target is advisory: use more space when required to preserve the full resolved inventory and scope. The hard limit applies after assembly too.`;

function fail(reason: SddConsistencyReason): never {
  // Closed diagnostics: rejected Markdown and repository text never become repair instructions.
  throw new SddDraftFormatFailure(reason, `The SDD draft violates its ${reason} consistency contract.`);
}

/** Excludes examples and hidden records from the contract. */
function visible(source: string): string {
  let fence: string | undefined;
  let comment = false;
  return source.replace(/\r\n/gu, '\n').split('\n').map(line => {
    const boundary = /^\s*(`{3,}|~{3,})/u.exec(line);
    if (fence) {
      // Comment syntax inside code is literal; only the original line can close it.
      if (boundary && boundary[1][0] === fence[0] && boundary[1].length >= fence.length
        && /^ {0,3}(?:`+|~+)[ \t]*$/u.test(line)) fence = undefined;
      return '';
    }
    if (!comment && boundary) { fence = boundary[1]; return ''; }
    let result = '';
    let offset = 0;
    while (offset < line.length) {
      const marker = comment ? '-->' : '<!--';
      const next = line.indexOf(marker, offset);
      if (next < 0) return result + (comment ? '' : line.slice(offset));
      if (!comment) result += line.slice(offset, next) + ' ';
      offset = next + marker.length;
      comment = !comment;
    }
    return result;
  }).join('\n');
}

function clean(value: string): string { return value.trim().replace(/^(?:\*\*|__|`)(.*?)(?:\*\*|__|`)$/u, '$1').trim(); }

function section(source: string, number: number, reason: SddConsistencyReason): string {
  const sections = [...source.matchAll(/^## (\d+)\. [^\n]*$/gmu)];
  const matches = sections.filter(heading => Number(heading[1]) === number);
  if (matches.length !== 1) return fail(reason);
  const start = matches[0];
  const end = sections.find(heading => heading.index > start.index)?.index ?? source.length;
  return source.slice(start.index + start[0].length, end);
}

function table(source: string, number: number, headers: readonly string[], reason: SddConsistencyReason): string[][] {
  const lines = section(source, number, reason).split('\n');
  const found: string[][][] = [];
  for (let index = 0; index < lines.length; index++) {
    if (!/^\s*\|/u.test(lines[index])) continue;
    const cells = (line: string) => line.trim().replace(/^\||\|$/gu, '').split('|').map(clean);
    const header = cells(lines[index]);
    if (!headers.every((value, position) => header[position] === value) || header.length !== headers.length) continue;
    const separator = cells(lines[++index] ?? '');
    if (separator.length !== headers.length || !separator.every(cell => /^:?-{3,}:?$/u.test(cell))) return fail(reason);
    const rows: string[][] = [];
    while (++index < lines.length && /^\s*\|/u.test(lines[index])) {
      const row = cells(lines[index]);
      if (row.length !== headers.length || row.some(cell => !cell)) return fail(reason);
      rows.push(row);
    }
    if (!rows.length) return fail(reason);
    found.push(rows);
  }
  return found.length === 1 ? found[0] : fail(reason);
}

function ids(value: string, pattern: RegExp, reason: SddConsistencyReason): string[] {
  const values = value.split(/\s*,\s*/u);
  if (!values.every(id => pattern.test(id)) || new Set(values).size !== values.length) return fail(reason);
  return values;
}

/** Never repairs definitions or contradictory supplied tables; the writer independently revalidates. */
export function renderSddDerivedTables(markdown: string): string {
  if (!markdown.includes(BUDGET_SLOT) && !markdown.includes(TRACEABILITY_SLOT)) return markdown;
  const source = visible(markdown);
  for (const [slot, number, reason] of [
    [BUDGET_SLOT, 14, 'case-budget'], [TRACEABILITY_SLOT, 17, 'requirement-mapping'],
  ] as const) {
    if (markdown.split(slot).length !== 2
      || section(source, number, reason).split('\n').filter(line => line.trim() === slot).length !== 1) fail(reason);
  }
  const requirements = table(source, 4, ['Requirement', 'Behavior'], 'requirement-mapping').map(row => row[0]);
  if (new Set(requirements).size !== requirements.length || requirements.some(id => !REQUIREMENT_ID.test(id))) fail('requirement-mapping');
  const cases = table(source, 14, ['Case ID', 'Area', 'Requirements', 'Scenario'], 'case-identity');
  const caseIds = cases.map(row => row[0]);
  if (new Set(caseIds).size !== caseIds.length || caseIds.some(id => !CASE_ID.test(id))) fail('case-identity');
  const counts = new Map<string, number>();
  const edges = new Map(requirements.map(id => [id, [] as string[]]));
  for (const [id, area, links] of cases) {
    if (area === 'Total') fail('case-budget');
    counts.set(area, (counts.get(area) ?? 0) + 1);
    for (const requirement of ids(links, REQUIREMENT_ID, 'requirement-mapping')) {
      const linked = edges.get(requirement);
      if (!linked) fail('requirement-mapping');
      linked.push(id);
    }
  }
  if ([...edges.values()].some(links => links.length === 0)) fail('requirement-mapping');
  const budget = ['| Area | Minimum distinct cases | Behaviors/risks covered |', '|---|---:|---|',
    ...[...counts].map(([area, count]) => `| ${area} | ${count} | Observable scenarios in the case inventory. |`),
    `| Total | ${cases.length} | Distinct inventory cases; repeated executions do not add cases. |`].join('\n');
  const traceability = ['| Requirement | Cases |', '|---|---|',
    ...[...edges].map(([requirement, links]) => `| ${requirement} | ${links.join(', ')} |`)].join('\n');
  return markdown.replace(BUDGET_SLOT, () => budget).replace(TRACEABILITY_SLOT, () => traceability);
}

export function reservedSddCaseIds(documents: readonly SddOwnerDocument[]): string[] {
  const reserved = new Set<string>();
  for (const document of documents) {
    const source = visible(document.markdown);
    const qualified = source.match(CASE) ?? [];
    const namespaces = new Set(qualified.map(id => id.slice(0, id.lastIndexOf('-C') + 2)));
    for (const id of qualified) reserved.add(id);
    // Legacy inventories often qualify C01 and abbreviate the remaining rows.
    // Reserve every plausible namespace instead of silently assigning an alias a new meaning.
    for (const match of source.matchAll(/(?<![\w-])C(\d+)\b/gu)) {
      for (const namespace of namespaces) reserved.add(`${namespace}${match[1]}`);
    }
    for (const match of source.matchAll(/\bC(\d+)\s*[-–—]\s*C?(\d+)\b/gu)) {
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start || end - start > 1000) {
        throw new Error('An owning SDD case range cannot be reconciled within the fixed bound; review the baseline before retrying.');
      }
      for (let number = start; number <= end; number++) {
        for (const namespace of namespaces) reserved.add(`${namespace}${String(number).padStart(match[1].length, '0')}`);
      }
    }
  }
  return [...reserved].sort();
}

export function validateSddDraftConsistency(
  markdown: string,
  owners: readonly SddOwnerDocument[],
  inventory: SddRepositoryInventory,
  sddPath: string,
): void {
  const source = visible(markdown);
  const requirements = table(source, 4, ['Requirement', 'Behavior'], 'requirement-mapping');
  const requirementIds = requirements.map(row => row[0]);
  if (new Set(requirementIds).size !== requirementIds.length || !requirementIds.every(id => REQUIREMENT_ID.test(id))) fail('requirement-mapping');
  const cases = table(source, 14, ['Case ID', 'Area', 'Requirements', 'Scenario'], 'case-identity');
  const caseIds = cases.map(row => row[0]);
  const reserved = new Set(reservedSddCaseIds(owners));
  if (new Set(caseIds).size !== caseIds.length || caseIds.some(id => !CASE_ID.test(id) || reserved.has(id))
    || /(?<![\w-])C\d+\b/u.test(source)) fail('case-identity');
  // References to existing owner cases are allowed, but cannot count as newly defined cases.
  if ([...source.matchAll(CASE)].some(([id]) => !caseIds.includes(id) && !reserved.has(id))) fail('case-identity');

  const budget = table(source, 14, ['Area', 'Minimum distinct cases', 'Behaviors/risks covered'], 'case-budget');
  const counts = new Map<string, number>();
  let total: number | undefined;
  for (const [area, value] of budget) {
    const count = /^[1-9]\d*$/u.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(count) || counts.has(area) || total !== undefined) fail('case-budget');
    if (area === 'Total') total = count;
    else counts.set(area, count);
  }
  if (!counts.size || total !== caseIds.length || [...counts.values()].reduce((sum, count) => sum + count, 0) !== total
    || cases.some(row => !counts.has(row[1]))) fail('case-budget');
  for (const [area, count] of counts) if (cases.filter(row => row[1] === area).length !== count) fail('case-budget');

  const edges = new Map(requirementIds.map(id => [id, new Set<string>()]));
  for (const [id, , links] of cases) {
    for (const requirement of ids(links, REQUIREMENT_ID, 'requirement-mapping')) {
      const linked = edges.get(requirement);
      if (!linked) fail('requirement-mapping');
      linked.add(id);
    }
  }
  const traceability = table(source, 17, ['Requirement', 'Cases'], 'requirement-mapping');
  const seen = new Set<string>();
  for (const [requirement, links] of traceability) {
    const expected = edges.get(requirement);
    const actual = ids(links, CASE_ID, 'requirement-mapping');
    if (!expected || seen.has(requirement) || expected.size !== actual.length || actual.some(id => !expected.has(id))) fail('requirement-mapping');
    seen.add(requirement);
  }
  if (seen.size !== edges.size || [...edges.values()].some(links => links.size === 0)) fail('requirement-mapping');
  validatePaths(source, inventory, sddPath);
}

function safePath(value: string): boolean {
  return value.length > 0 && !/[\\:*?"<>|\p{Cc}]/u.test(value)
    && value.split('/').every(segment => segment && segment !== '.' && segment !== '..' && segment.toLowerCase() !== '.git');
}

function validatePaths(source: string, inventory: SddRepositoryInventory, sddPath: string): void {
  const rows = table(source, 15, ['Path', 'Change'], 'repository-path');
  const expectedChange = inventory.files.has(sddPath) ? 'update' : 'create';
  if (!rows.some(([file, change]) => file === sddPath && change === expectedChange)) fail('repository-path');
  const proposed = new Set<string>();
  const seen = new Set<string>();
  for (const [file, change] of rows) {
    if (!safePath(file) || seen.has(file) || inventory.blocked.has(file)) fail('repository-path');
    seen.add(file);
    if (change === 'create') {
      if (inventory.files.has(file) || inventory.directories.has(file)) fail('repository-path');
      if ([...proposed].some(other => file.startsWith(`${other}/`) || other.startsWith(`${file}/`))) fail('repository-path');
      const segments = file.split('/');
      if (segments.some((_, index) => inventory.files.has(segments.slice(0, index + 1).join('/')) || inventory.blocked.has(segments.slice(0, index + 1).join('/')))) fail('repository-path');
      proposed.add(file);
    } else if (!['update', 'reference'].includes(change) || !inventory.files.has(file)) fail('repository-path');
  }
  const check = (file: string) => {
    if (!safePath(file) || (!inventory.files.has(file) && !inventory.directories.has(file) && !proposed.has(file))) fail('repository-path');
  };
  // Relative Markdown file links resolve against the selected SDD, never the current checkout.
  for (const match of source.matchAll(/\]\(([^\s)]+)\)/gu)) {
    const href = match[1].split(/[?#]/u)[0];
    if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/)/iu.test(href)) continue;
    let decoded: string;
    try { decoded = decodeURIComponent(href); } catch { return fail('repository-path'); }
    const parts = sddPath.split('/').slice(0, -1);
    for (const part of decoded.split('/')) {
      if (part === '..') { if (!parts.length) fail('repository-path'); parts.pop(); }
      else if (part !== '.') parts.push(part);
    }
    check(parts.join('/'));
  }
  for (const match of source.matchAll(/`([^`\n]+)`/gu)) {
    const value = match[1];
    if (value.includes('/') && !/^(?:[a-z][a-z0-9+.-]*:|\/)/iu.test(value) && !/\s/u.test(value)) check(value.replace(/\/$/u, ''));
  }
  const prose = source.replace(/\]\([^\s)]+\)/gu, ']()').replace(/[a-z][a-z0-9+.-]*:\/\/[^\s)>]+/giu, '');
  for (const match of prose.matchAll(/(?<![\w./:-])([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.[A-Za-z0-9]+)(?![\w/-])/gu)) check(match[1]);
}
