import { admitSddArtifact, requireSddCapacity, sddBytes, SDD_RESOURCES } from './sdd_resource_budget';
import { SddDraftFormatFailure, type SddPlan } from './pre_branch_sdd';
import { isSafeSddRepositoryPath } from './sdd_repository_reference';
import { visibleSddContract } from './sdd_draft_consistency';

export const SDD_HEADINGS = Object.freeze([
  'Executive summary', 'Problem, current behavior, and evidence', 'Actors, surfaces, and terminology',
  'Goals, non-goals, and fixed invariants', 'Current versus proposed product journey', 'Functional behavior and state model',
  'User-facing configuration', 'Clean Architecture design', 'UI/UX and content contract', 'Failure, recovery, and cleanup',
  'Security, permissions, and privacy', 'Observability and operational UX', 'Compatibility, migration, rollout, and rollback',
  'Testing strategy and numeric budget', 'Documentation and discoverability', 'Acceptance scenarios', 'Requirements traceability',
  'Implementation sequence', 'Definition of Done', 'References and decisions',
]);

const TABLES = {
  requirements: ['Requirement', 'Behavior'],
  cases: ['Case ID', 'Area', 'Requirements', 'Scenario'],
  paths: ['Path', 'Change'],
  budgets: ['Area', 'Minimum distinct cases', 'Behaviors/risks covered'],
} as const;
const REQUIREMENT_ID = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+$/u;
const CASE_ID = /^(?:[A-Za-z][A-Za-z0-9]*-)+C\d+$/u;
const KEYS = ['requirements', 'cases', 'paths'] as const;
type RowKind = typeof KEYS[number];
type Row = readonly string[];
export type SddInventory = Readonly<Record<RowKind, readonly Row[]>>;
export interface SddObligations extends SddInventory {
  readonly budgets: readonly Row[];
}

export function planSddUnits(inputs: readonly string[]) {
  const bytes = inputs.reduce((total, part) => total + sddBytes(part), 0);
  requireSddCapacity('input', 'bytes', SDD_RESOURCES.inputBytes, bytes);
  const source: string[] = [];
  for (const input of inputs) {
    let part = '', used = 0;
    for (const point of input) {
      const n = point.codePointAt(0)!;
      const width = n < 128 ? 1 : n < 2048 ? 2 : n < 65536 ? 3 : 4;
      if (used + width > SDD_RESOURCES.sourceSliceBytes) {
        source.push(part);
        part = '';
        used = 0;
      }
      part += point;
      used += width;
    }
    if (part) source.push(part);
  }
  const groups = [[1, 2, 3, 4], [5, 6, 7, 8], [9, 10, 11, 12, 13], [14, 15, 16, 17], [18, 19, 20]];
  requireSddCapacity('plan', 'units', SDD_RESOURCES.units, source.length + groups.length);
  return {
    inventory: source.map((text, index) => ({ id: 'inventory-' + (index + 1), text })),
    prose: groups.map((sections, index) => ({ id: 'prose-' + (index + 1), sections })),
  };
}

export function explicitSddObligations(inputs: readonly string[]): SddObligations {
  const result: Record<keyof SddObligations, Row[]> = { requirements: [], cases: [], paths: [], budgets: [] };
  for (const input of inputs) visitSddTables(input, (key, rows) => result[key].push(...rows));
  return result;
}

/** Keep the surrounding decisions, but do not ask the provider to re-extract pinned rows. */
export function sddInventorySource(input: string): string {
  const source = input.replace(/\r\n/gu, '\n').split('\n');
  visitSddTables(input, (key, rows, start, end) => {
    source[start] = '[Canonical ' + key + ' table: ' + rows.length + ' rows retained by the host.]';
    source.fill('', start + 1, end);
  });
  return source.join('\n');
}

function visitSddTables(input: string, visit: (key: keyof SddObligations, rows: readonly Row[], start: number, end: number) => void): void {
  const lines = visibleSddContract(input).split('\n');
  for (let index = 0; index + 1 < lines.length; index++) {
    if (!/^\s*\|/u.test(lines[index])) continue;
    const head = cells(lines[index]);
    const key = (Object.keys(TABLES) as (keyof SddObligations)[]).find(kind => sameRow(TABLES[kind], head));
    if (!key) continue;
    const separator = cells(lines[index + 1]);
    if (separator.length !== head.length || !separator.every(cell => /^:?-{3,}:?$/u.test(cell))) continue;
    const start = index;
    const rows: Row[] = [];
    index += 2;
    while (index < lines.length && /^\s*\|/u.test(lines[index])) {
      const row = cells(lines[index++]);
      if (row.length !== head.length || row.some(cell => !cell)) throw inventoryFailure(key === 'budgets' ? 'cases' : key);
      requireSddCapacity('plan', 'rows', SDD_RESOURCES.rows, rows.length + 1);
      rows.push(row);
    }
    visit(key, rows, start, index);
    index--;
  }
}

function cells(line: string): string[] {
  return line.trim().replace(/^\||\|$/gu, '').split('|').map(cell =>
    cell.trim().replace(/^(?:\*\*|__|\x60)(.*?)(?:\*\*|__|\x60)$/u, '$1').trim());
}

function sameRow(left: Row, right: Row): boolean {
  return left.length === right.length && left.every((cell, index) => cell === right[index]);
}

export function inventoryFailure(key: RowKind): SddDraftFormatFailure {
  const reason = key === 'requirements' ? 'requirement-mapping' : key === 'cases' ? 'case-identity' : 'repository-path';
  return new SddDraftFormatFailure(reason, 'An SDD inventory unit is incomplete or conflicts with admitted obligations.');
}

export function mergeSddInventory(explicit: SddInventory, units: readonly SddInventory[], plan: SddPlan): SddInventory {
  const result: Record<RowKind, Row[]> = { requirements: [], cases: [], paths: [] };
  let count = 0, edges = 0;
  for (const key of KEYS) {
    const rows = new Map<string, Row>();
    for (const source of [explicit, ...units]) {
      for (const row of source[key]) {
        if (row.length !== TABLES[key].length || row.some(cell => typeof cell !== 'string' || !cell.trim()
          || /[|\r\n\0]/u.test(cell))) throw inventoryFailure(key);
        if (key === 'requirements' && !REQUIREMENT_ID.test(row[0])) throw inventoryFailure(key);
        if (key === 'cases' && (!CASE_ID.test(row[0]) || row[1] === 'Total'
          || row[2].split(/\s*,\s*/u).some(id => !REQUIREMENT_ID.test(id)))) throw inventoryFailure(key);
        if (key === 'paths' && (!isSafeSddRepositoryPath(row[0]) || !['create', 'update', 'reference'].includes(row[1]))) {
          throw inventoryFailure(key);
        }
        const prior = rows.get(row[0]);
        if (prior && !sameRow(prior, row)) throw inventoryFailure(key);
        if (!prior) {
          requireSddCapacity('plan', 'rows', SDD_RESOURCES.rows, ++count);
          if (key === 'cases') requireSddCapacity('plan', 'edges', SDD_RESOURCES.edges, edges += row[2].split(',').length);
          rows.set(row[0], row);
        }
      }
    }
    if (key === 'paths') {
      const operation = plan.action === 'update' ? 'update' : 'create';
      if (rows.has(plan.path) && rows.get(plan.path)?.[1] !== operation) throw inventoryFailure(key);
      rows.set(plan.path, [plan.path, operation]);
    }
    result[key] = [...rows.values()];
  }
  return result;
}

function renderTable(headers: Row, rows: readonly Row[]): string {
  const line = (row: Row) => '| ' + row.join(' | ') + ' |';
  return [line(headers), line(headers.map(() => '---')), ...rows.map(line)].join('\n');
}

export function assembleSddUnits(title: string, plan: SddPlan, inventory: SddInventory, sections: ReadonlyMap<number, string>): string {
  const tables = new Map([
    [4, renderTable(TABLES.requirements, inventory.requirements)],
    [14, '{{SDD_CASE_BUDGET}}\n\n' + renderTable(TABLES.cases, inventory.cases)],
    [15, renderTable(TABLES.paths, inventory.paths) + '\n\n{{SDD_FILE_NAVIGATION}}'],
    [17, '{{SDD_REQUIREMENT_CASES}}'],
  ]);
  const rendered = SDD_HEADINGS.map((heading, index) => {
    const number = index + 1;
    const body = sections.get(number);
    if (!body) throw new SddDraftFormatFailure('required-heading', 'An SDD prose unit did not cover every planned section.');
    return ['## ' + number + '. ' + heading, body, tables.get(number)].filter(Boolean).join('\n\n');
  });
  const safeTitle = title.replace(/[\r\n<>]/gu, ' ').trim().slice(0, 500) || 'Issue contract';
  const markdown = ['# ' + (plan.action === 'update' ? 'Proposed change: ' : '') + safeTitle,
    '- Status: Draft\n- Catalog capability: ' + plan.capabilityId, ...rendered].join('\n\n') + '\n';
  admitSddArtifact(markdown);
  return markdown;
}

export function assertSddObligations(markdown: string, explicit: SddObligations): void {
  const actual = explicitSddObligations([markdown]);
  for (const key of KEYS) {
    const rows = new Map(actual[key].map(row => [row[0], row]));
    if (explicit[key].some(row => !sameRow(row, rows.get(row[0]) ?? []))) throw inventoryFailure(key);
  }
  const budget = new Map(actual.budgets.map(row => [row[0], Number(row[1])]));
  for (const [area, count] of explicit.budgets) {
    if (/^[1-9]\d*$/u.test(count) && !(Number(budget.get(area)) >= Number(count))) {
      throw new SddDraftFormatFailure('case-budget', 'The SDD does not satisfy an explicit numeric test allocation.');
    }
  }
}
