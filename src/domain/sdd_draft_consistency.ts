import type { SddValidationFact } from './sdd_validation_diagnostic';
import { SddDraftFormatFailure } from './pre_branch_sdd';
import { appendSddReferenceContext, buildSddReferenceIndex, hasBlockedSddAncestor, isKnownSddRepositoryReference, isSddFileRole, isSafeSddRepositoryPath as safePath,
  isSddNonFileNotation, sddReferencePrefix, type SddRepositoryInventory } from './sdd_repository_reference';
export type { SddRepositoryInventory } from './sdd_repository_reference';
import { readSddVisibleReferences } from './sdd_visible_references';
import { countSddShorthandCaseReferences } from './sdd_case_reference';

export type SddConsistencyReason = 'case-identity' | 'case-budget' | 'requirement-mapping' | 'repository-path';
export interface SddOwnerDocument { readonly path: string; readonly markdown: string }

const CASE = /\b(?:[A-Za-z][A-Za-z0-9]*-)+C\d+\b/gu;
const CASE_ID = /^(?:[A-Za-z][A-Za-z0-9]*-)+C\d+$/u;
const REQUIREMENT_ID = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+$/u;

/** Generated candidates use visible tables; retained legacy owners are never reformatted. */
export const SDD_CONSISTENCY_PROMPT = `Consistency contract for the final assembled proposed draft/appendix (not the retained owner):
In section 4 include one table: Requirement | Behavior. Give every goal a stable hyphenated requirement ID, such as G-01. Its alphabetic prefix must have at least one hyphen-separated alphanumeric segment; unseparated G1 and G01 are invalid.
In section 14 include one budget table: Area | Minimum distinct cases | Behaviors/risks covered; positive integers and one Total.
Also in section 14 include one inventory table: Case ID | Area | Requirements | Scenario.
Each row is one distinct executable case with a fully qualified ID: one or more hyphen-separated namespace segments of letters/digits, each starting with a letter, followed by -C and decimal digits, such as capability-change-C01. Keep that exact case-ID grammar in both drafts and repairs. Each row has one exact budget area, comma-separated requirement IDs and an observable scenario. Never use shorthand C01, ranges or redefine an ID found in any owning SDD. Reference retained baseline cases in prose using their full IDs; count only the new inventory. Ordinary technical designators in prose, scenario text or non-case columns are not acceptance-case references solely because they resemble short IDs; preserve their original terminology. Case-reference fields, explicit references and adjacent case-ID lists still require full identities.
In section 17 include one table: Requirement | Cases. List comma-separated full case IDs for every requirement. Its links must exactly match the case inventory in both directions, with no undefined or generic documentation checks.
In section 15 include one table: Path | Change. Path cells contain literal full repository-relative paths, optionally wrapped as code; do not format a Path cell as a Markdown link. Put navigation links outside this table. Change is update, reference or create. Include the selected SDD path itself with update for an existing SDD or create for a new/companion SDD. Use existing immutable-base files for update/reference. Only explicitly proposed new files may use create; never mark a missing current document as an existing artifact. Cite repository files as full repository-relative paths in backticks with a File or Path label when ambiguous, or relative Markdown file links. Put every planned new file in this table; a proposed parent directory is valid only as an ancestor of a declared new file, never as a file declaration. HTTP endpoints, media types, mode alternatives and module names are protocol notation, not file-existence claims. Label file-shaped relative asset addresses with URL or URI; do not relabel a repository citation to evade validation. Explicit Path/Change rows and relative Markdown destinations always receive strict repository checks. These tables are publication consistency checks, not runtime/security acceptance.`;

const BUDGET_SLOT = '{{SDD_CASE_BUDGET}}';
const TRACEABILITY_SLOT = '{{SDD_REQUIREMENT_CASES}}';

/** The provider writes definitions once; trusted code renders their two redundant projections. */
export const SDD_DERIVED_TABLES_PROMPT = `Draft assembly: the consistency contract above describes the final document. In your raw Markdown, write the complete Requirement | Behavior table in section 4 and Case ID | Area | Requirements | Scenario inventory in section 14. Preserve every resolved minimum, per-area allocation and observable case as actual inventory rows, never ranges or summaries. Instead of independently writing the budget table, put ${BUDGET_SLOT} once on its own visible line in section 14. Instead of writing the reverse Requirement | Cases table, put ${TRACEABILITY_SLOT} once on its own visible line in section 17. One pair of inline-code backticks around an entire visible slot line is tolerated; bare slot lines are preferred. Do not include either derived table yourself or put these slots in examples, fences or comments. Trusted code derives exact counts, Total and reciprocal links from your unchanged definitions, then runs every publication check. The compact character target is advisory: use more space when required to preserve the full resolved inventory and scope. The hard limit applies after assembly too.`;

export const SDD_FILE_LINKS_PROMPT = 'Repository navigation is a trusted projection of your operative section-15 Path | Change inventory. In raw Markdown put {{SDD_FILE_NAVIGATION}} once in visible prose in section 15; a separate line is recommended, and one paired inline-code wrapper is tolerated. The host renders file links for every declared row, with exact targets and relative destinations derived from the publication path. Do not separately repeat file targets in navigation markers or guess repository-relative Markdown URLs. Keep Path cells as literal full repository-relative paths, never links or placeholders. Preserve all planned create rows; navigation cannot authorize a new target or infer a create/update operation. Cite files elsewhere using their exact full paths in ordinary prose/code. Representative UI examples may use the supplied canonical issue URL or document anchors without inventing run links. Remove authoring notes. Existing valid Markdown and legacy explicit file markers remain supported and strictly validated, but use the inventory projection for newly authored navigation. The original final size bound, schema and single shared repair apply.';

function fail(reason: SddConsistencyReason, fact: SddValidationFact, additional: readonly SddValidationFact[] = []): never {
  // Closed diagnostics: rejected Markdown and repository text never become repair instructions.
  throw new SddDraftFormatFailure(reason, `The SDD draft violates its ${reason} consistency contract.`, { reason, phase: 'validation', facts: [fact, ...additional] });
}

function assertRequirementsCovered(counts: readonly number[]): void {
  const missing = counts.filter(count => count === 0).length;
  if (missing) fail('requirement-mapping', { detail: 'requirement-coverage', section: 17, expected: 0, observed: missing },
    [{ detail: 'requirement-coverage', section: 4, row: counts.indexOf(0) + 1, expected: 1, observed: 0 }]);
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

function section(source: string, number: Exclude<SddValidationFact['section'], 0>, reason: SddConsistencyReason): string {
  const sections = [...source.matchAll(/^## (\d+)\. [^\n]*$/gmu)];
  const matches = sections.filter(heading => Number(heading[1]) === number);
  if (matches.length !== 1) return fail(reason, { detail: 'section-count', section: number, expected: 1, observed: matches.length });
  const start = matches[0];
  const end = sections.find(heading => heading.index > start.index)?.index ?? source.length;
  return source.slice(start.index + start[0].length, end);
}

function table(source: string, number: Exclude<SddValidationFact['section'], 0>, headers: readonly string[], reason: SddConsistencyReason, rowSources?: Set<string>): string[][] {
  const lines = section(source, number, reason).split('\n');
  const found: string[][][] = [];
  for (let index = 0; index < lines.length; index++) {
    if (!/^\s*\|/u.test(lines[index])) continue;
    const cells = (line: string) => line.trim().replace(/^\||\|$/gu, '').split('|').map(clean);
    const header = cells(lines[index]);
    if (!headers.every((value, position) => header[position] === value) || header.length !== headers.length) continue;
    const separator = cells(lines[++index] ?? '');
    if (separator.length !== headers.length || !separator.every(cell => /^:?-{3,}:?$/u.test(cell))) return fail(reason, { detail: 'table-separator', section: number, row: index + 1 });
    const rows: string[][] = [];
    while (++index < lines.length && /^\s*\|/u.test(lines[index])) {
      const row = cells(lines[index]);
      if (row.length !== headers.length) return fail(reason, { detail: 'table-columns', section: number, row: rows.length + 1, expected: headers.length, observed: row.length });
      if (row.some(cell => !cell)) return fail(reason, { detail: 'table-empty-cell', section: number, row: rows.length + 1 });
      rows.push(row);
      rowSources?.add(lines[index]);
    }
    if (!rows.length) return fail(reason, { detail: 'table-empty', section: number, observed: 0 });
    found.push(rows);
  }
  return found.length === 1 ? found[0] : fail(reason, { detail: 'table-count', section: number, expected: 1, observed: found.length });
}

function ids(value: string, pattern: RegExp, reason: SddConsistencyReason, section: SddValidationFact['section']): string[] {
  const values = value.split(/\s*,\s*/u);
  if (!values.every(id => pattern.test(id)) || new Set(values).size !== values.length) return fail(reason, { detail: 'identifier-list', section, observed: values.length });
  return values;
}

/** File links are a projection of the unchanged path inventory, never a second target list. */
export function renderSddNavigation(markdown: string, publicationPath: string): string {
  const slot = '{{SDD_FILE_NAVIGATION}}';
  const prefix = /\{\{\s*SDD_FILE_NAVIGATION\b/iu;
  if (!prefix.test(markdown)) return markdown;
  if (!safePath(publicationPath) || markdown.split(slot).length !== 2) fail('repository-path', { detail: 'path-link', section: 0 });
  const source = visible(markdown);
  const placed = section(source, 15, 'repository-path').split('\n').filter(line => {
    if (/^(?: {4}| {0,3}\t)/u.test(line)) return false;
    const index = line.indexOf(slot);
    if (index < 0) return false;
    let before = line.slice(0, index), after = line.slice(index + slot.length);
    if (before.endsWith('`') && after.startsWith('`')) { before = before.slice(0, -1); after = after.slice(1); }
    return !/[`[\](){}<>|]/u.test(before + after);
  }).length;
  if (placed !== 1) fail('repository-path', { detail: 'path-link', section: 0 });
  const rows = table(source, 15, ['Path', 'Change'], 'repository-path');
  const links = rows.map(([target]) => {
    const destination = sddFileDestination(target, publicationPath);
    const label = target.replace(/&/gu, '&amp;').replace(/[`*_[\]~$]/gu, '\\$&');
    return `[${label}](${destination})`;
  }).join(' · ');
  const wrapped = '`' + slot + '`';
  const result = markdown.replace(markdown.includes(wrapped) ? wrapped : slot, () => links);
  if (prefix.test(result)) fail('repository-path', { detail: 'path-link', section: 0 });
  return result;
}

/** Derive navigation only from explicit targets; the workspace still proves existence. */
export function renderSddFileLinks(markdown: string, publicationPath: string): string {
  const prefix = /\{\{\s*SDD_FILE_LINK\b/iu;
  if (!prefix.test(markdown)) return markdown;
  if (!safePath(publicationPath)) fail('repository-path', { detail: 'owner-path', section: 15 });
  const pattern = /\{\{SDD_FILE_LINK:([^{}\r\n`]*)\}\}/gu;
  const tokens = [...markdown.matchAll(pattern)];
  if (!tokens.length) fail('repository-path', { detail: 'path-link', section: 0 });
  const declared = new Set(table(visible(markdown), 15, ['Path', 'Change'], 'repository-path').map(row => row[0]));
  let cursor = 0, result = '';
  for (const token of tokens) {
    const target = token[1], begin = token.index, end = begin + token[0].length;
    const destination = sddFileDestination(target, publicationPath);
    if (!declared.has(target)) fail('repository-path', { detail: 'path-link', section: 0 });
    let start = begin, finish = end;
    while (markdown[start - 1] === '`') start--;
    while (markdown[finish] === '`') finish++;
    let left = start - 1, right = finish;
    const angle = markdown[left] === '<';
    if (angle) left--;
    while (/[ \t]/u.test(markdown[left] ?? '')) left--;
    const paired = !angle || markdown[right++] === '>';
    while (/[ \t]/u.test(markdown[right] ?? '')) right++;
    const inDestination = markdown[left] === '(' && markdown[left - 1] === ']';
    if (inDestination && (!paired || markdown[right] !== ')' || begin - start !== finish - end)) {
      fail('repository-path', { detail: 'path-link', section: 0 });
    }
    // Outside a URL field this is a literal repository citation, not a nested link.
    if (!inDestination) { start = begin; finish = end; }
    result += markdown.slice(cursor, start) + (inDestination ? destination : target);
    cursor = finish;
  }
  result += markdown.slice(cursor);
  if (prefix.test(result)) fail('repository-path', { detail: 'path-link', section: 0 });
  return result;
}

function sddFileDestination(target: string, publicationPath: string): string {
  if (!safePath(target)) fail('repository-path', { detail: 'path-link', section: 0 });
  const parent = publicationPath.split('/').slice(0, -1), parts = target.split('/');
  let common = 0;
  while (common < parent.length && common < parts.length && parent[common] === parts[common]) common++;
  const relative = [...Array<string>(parent.length - common).fill('..'), ...parts.slice(common)];
  if (!relative.length) fail('repository-path', { detail: 'path-link', section: 0 });
  try {
    return relative.map(part => encodeURIComponent(part).replace(/[!'()*]/gu,
      character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
  } catch { return fail('repository-path', { detail: 'path-link', section: 0 }); }
}

/** Never repairs definitions or contradictory supplied tables; the writer independently revalidates. */
export function renderSddDerivedTables(markdown: string): string {
  if (!markdown.includes(BUDGET_SLOT) && !markdown.includes(TRACEABILITY_SLOT)) return markdown;
  const source = visible(markdown);
  let normalized = markdown;
  for (const [slot, number, reason] of [
    [BUDGET_SLOT, 14, 'case-budget'], [TRACEABILITY_SLOT, 17, 'requirement-mapping'],
  ] as const) {
    const occurrences = markdown.split(slot).length - 1;
    if (occurrences !== 1) fail(reason, { detail: 'derived-slot-count', section: number, expected: 1, observed: occurrences });
    const wrapped = '`' + slot + '`';
    const placed = section(source, number, reason).split('\n').filter(line => line.trim() === slot || line.trim() === wrapped).length;
    if (placed !== 1) fail(reason, { detail: 'derived-slot-placement', section: number, expected: 1, observed: placed });
    normalized = normalized.replace(wrapped, slot);
  }
  const requirements = table(source, 4, ['Requirement', 'Behavior'], 'requirement-mapping').map(row => row[0]);
  uniqueIdentifiers(requirements, REQUIREMENT_ID, 'requirement-mapping', 4);
  const cases = table(source, 14, ['Case ID', 'Area', 'Requirements', 'Scenario'], 'case-identity');
  const caseIds = cases.map(row => row[0]);
  uniqueIdentifiers(caseIds, CASE_ID, 'case-identity', 14);
  const counts = new Map<string, number>();
  const edges = new Map(requirements.map(id => [id, [] as string[]]));
  for (const [index, [id, area, links]] of cases.entries()) {
    if (area === 'Total') fail('case-budget', { detail: 'budget-area', section: 14 });
    counts.set(area, (counts.get(area) ?? 0) + 1);
    for (const requirement of ids(links, REQUIREMENT_ID, 'requirement-mapping', 14)) {
      const linked = edges.get(requirement);
      if (!linked) fail('requirement-mapping', { detail: 'requirement-reference', section: 14, row: index + 1, expected: 0, observed: 1 });
      linked.push(id);
    }
  }
  assertRequirementsCovered([...edges.values()].map(links => links.length));
  const budget = ['| Area | Minimum distinct cases | Behaviors/risks covered |', '|---|---:|---|',
    ...[...counts].map(([area, count]) => `| ${area} | ${count} | Observable scenarios in the case inventory. |`),
    `| Total | ${cases.length} | Distinct inventory cases; repeated executions do not add cases. |`].join('\n');
  const traceability = ['| Requirement | Cases |', '|---|---|',
    ...[...edges].map(([requirement, links]) => `| ${requirement} | ${links.join(', ')} |`)].join('\n');
  return normalized.replace(BUDGET_SLOT, () => budget).replace(TRACEABILITY_SLOT, () => traceability);
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

/** Only explicit definitions in admitted request/answer text establish new case identities. */
export function suppliedSddCaseIds(inputs: readonly string[], owners: readonly SddOwnerDocument[]): string[] {
  const reserved = new Set(reservedSddCaseIds(owners));
  const supplied = new Set<string>();
  const add = (id: string) => { if (CASE_ID.test(id) && !reserved.has(id)) supplied.add(id); };
  for (const input of inputs) {
    const lines = visible(input).split('\n');
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      // Quoted and indented examples are not operative definitions.
      if (/^(?: {4}|\t| {0,3}>)/u.test(line)) continue;
      if (/^\s*\|/u.test(line)) {
        const cells = (row: string) => row.trim().replace(/^\||\|$/gu, '').split('|').map(clean);
        const header = cells(line);
        const scenario = header.findIndex(cell => cell === 'Scenario' || cell === 'Assertion');
        const separator = cells(lines[index + 1] ?? '');
        if (header[0] !== 'Case ID' || scenario < 1 || separator.length !== header.length
          || !separator.every(cell => /^:?-{3,}:?$/u.test(cell))) continue;
        index += 2;
        while (index < lines.length && /^\s*\|/u.test(lines[index])) {
          const row = cells(lines[index]);
          if (row.length === header.length && row[scenario]) add(row[0]);
          index++;
        }
        index--;
      } else {
        const declaration = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?([^:]+):\s*\S/u.exec(line);
        if (declaration) add(clean(declaration[1]));
      }
    }
  }
  return [...supplied].sort();
}

/** References and renamed aliases cannot stand in for supplied inventory definitions. */
export function validateSuppliedSddCaseIds(markdown: string, supplied: readonly string[]): void {
  if (!supplied.length) return;
  const defined = new Set(table(visible(markdown), 14, ['Case ID', 'Area', 'Requirements', 'Scenario'], 'case-identity').map(row => row[0]));
  const observed = supplied.filter(id => defined.has(id)).length;
  if (observed !== supplied.length) fail('case-identity', { detail: 'case-identity', section: 14, expected: supplied.length, observed });
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
  uniqueIdentifiers(requirementIds, REQUIREMENT_ID, 'requirement-mapping', 4);
  const cases = table(source, 14, ['Case ID', 'Area', 'Requirements', 'Scenario'], 'case-identity');
  const caseIds = cases.map(row => row[0]);
  const reserved = new Set(reservedSddCaseIds(owners));
  uniqueIdentifiers(caseIds, CASE_ID, 'case-identity', 14);
  const shorthand = countSddShorthandCaseReferences(source);
  if (shorthand) fail('case-identity', { detail: 'case-shorthand', section: 0, expected: 0, observed: shorthand });
  const collisions = caseIds.filter(id => reserved.has(id)).length;
  if (collisions) fail('case-identity', { detail: 'case-reserved', section: 14, expected: 0, observed: collisions });
  // References to existing owner cases are allowed, but cannot count as newly defined cases.
  const defined = new Set(caseIds);
  for (const [id] of source.matchAll(CASE)) {
    if (!defined.has(id) && !reserved.has(id)) fail('case-identity', { detail: 'case-reference', section: 0 });
  }

  const budget = table(source, 14, ['Area', 'Minimum distinct cases', 'Behaviors/risks covered'], 'case-budget');
  const counts = new Map<string, number>();
  let total: number | undefined;
  for (const [area, value] of budget) {
    const count = /^[1-9]\d*$/u.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(count)) fail('case-budget', { detail: 'budget-integer', section: 14 });
    if (counts.has(area) || total !== undefined) fail('case-budget', { detail: 'budget-order', section: 14 });
    if (area === 'Total') total = count;
    else counts.set(area, count);
  }
  if (!counts.size) fail('case-budget', { detail: 'budget-total', section: 14, expected: 1, observed: 0 });
  if (total !== caseIds.length) fail('case-budget', { detail: 'budget-total', section: 14, expected: caseIds.length, ...(total !== undefined && total <= 100_000 ? { observed: total } : {}) });
  const sum = [...counts.values()].reduce((value, count) => value + count, 0);
  if (sum !== total) fail('case-budget', { detail: 'budget-total', section: 14, expected: total, ...(sum <= 100_000 ? { observed: sum } : {}) });
  const observedCounts = new Map<string, number>();
  let unknownAreas = 0;
  for (const [, area] of cases) {
    if (counts.has(area)) observedCounts.set(area, (observedCounts.get(area) ?? 0) + 1);
    else unknownAreas++;
  }
  if (unknownAreas) fail('case-budget', { detail: 'budget-area', section: 14, expected: 0, observed: unknownAreas });
  for (const [area, count] of counts) {
    const observed = observedCounts.get(area) ?? 0;
    if (observed !== count) fail('case-budget', { detail: 'budget-distribution', section: 14, expected: count, observed });
  }

  const edges = new Map(requirementIds.map(id => [id, new Set<string>()]));
  for (const [index, [id, , links]] of cases.entries()) {
    for (const requirement of ids(links, REQUIREMENT_ID, 'requirement-mapping', 14)) {
      const linked = edges.get(requirement);
      if (!linked) fail('requirement-mapping', { detail: 'requirement-reference', section: 14, row: index + 1, expected: 0, observed: 1 });
      linked.add(id);
    }
  }
  assertRequirementsCovered([...edges.values()].map(links => links.size));
  const traceability = table(source, 17, ['Requirement', 'Cases'], 'requirement-mapping');
  const seen = new Set<string>();
  for (const [requirement, links] of traceability) {
    const expected = edges.get(requirement);
    const actual = ids(links, CASE_ID, 'requirement-mapping', 17);
    if (!expected || seen.has(requirement)) fail('requirement-mapping', { detail: 'traceability-requirement', section: 17, row: seen.size + 1, expected: 0, observed: 1 });
    if (expected.size !== actual.length) fail('requirement-mapping', { detail: 'traceability-links', section: 17, row: seen.size + 1, expected: expected.size, observed: actual.length });
    let mismatch = 0;
    for (const id of actual) {
      if (!expected.has(id)) mismatch++;
    }
    // The validated sets have equal cardinality, so each unexpected edge also displaces an expected edge.
    mismatch *= 2;
    if (mismatch) fail('requirement-mapping', { detail: 'traceability-membership', section: 17, row: seen.size + 1, expected: 0, observed: mismatch });
    seen.add(requirement);
  }
  if (seen.size !== edges.size) fail('requirement-mapping', { detail: 'requirement-coverage', section: 17, expected: edges.size, observed: seen.size });
  validatePaths(source, inventory, sddPath);
}

function validatePaths(source: string, inventory: SddRepositoryInventory, sddPath: string): void {
  const declarationRows = new Set<string>();
  const rows = table(source, 15, ['Path', 'Change'], 'repository-path', declarationRows);
  const expectedChange = inventory.files.has(sddPath) ? 'update' : 'create';
  if (!rows.some(([file, change]) => file === sddPath && change === expectedChange)) fail('repository-path', { detail: 'owner-path', section: 15 });
  const proposed = new Set<string>();
  const seen = new Set<string>();
  for (const [file, change] of rows) {
    if (!safePath(file) || seen.has(file) || inventory.blocked.has(file)) fail('repository-path', { detail: 'path-identity', section: 15, row: seen.size + 1 });
    seen.add(file);
    if (change === 'create') {
      if (inventory.files.has(file) || inventory.directories.has(file)) fail('repository-path', { detail: 'create-existing-path', section: 15, row: seen.size });
      if ([...proposed].some(other => file.startsWith(`${other}/`) || other.startsWith(`${file}/`))) fail('repository-path', { detail: 'create-path-overlap', section: 15, row: seen.size });
      const segments = file.split('/');
      if (segments.some((_, index) => inventory.files.has(segments.slice(0, index + 1).join('/')) || inventory.blocked.has(segments.slice(0, index + 1).join('/')))) fail('repository-path', { detail: 'create-path-parent', section: 15, row: seen.size });
      proposed.add(file);
    } else if (!['update', 'reference'].includes(change) || !inventory.files.has(file)) fail('repository-path', { detail: 'path-operation', section: 15, row: seen.size });
  }
  const referenceIndex = buildSddReferenceIndex(inventory, proposed);
  // CommonMark replaces NUL with U+FFFD. Never let that normalization establish
  // another repository identity from unsafe visible source spelling.
  if (source.includes('\0')) fail('repository-path', { detail: 'path-reference', section: 0 }, [{ detail: 'path-reference-unsafe', section: 0 }]);
  // These exact two-cell rows have already received strict declaration checks.
  // Do not reinterpret their file identities as prose suffixes or Markdown links.
  const referenceSource = source.split('\n').map(line => declarationRows.has(line) ? ' '.repeat(line.length) : line).join('\n');
  const references = readSddVisibleReferences(referenceSource);
  type Origin = 'path-inline-reference' | 'path-prose-reference' | 'path-link-reference';
  const reject = (origin: Origin, ordinal: number, detail: 'path-reference-unsafe' | 'path-reference-blocked' | 'path-reference-missing' | 'path-reference-directory') =>
    fail('repository-path', { detail: 'path-reference', section: 0 },
      [{ detail: origin, section: 0, row: ordinal }, { detail, section: 0 }]);
  const check = (file: string, origin: Origin, ordinal: number, directory = false) => {
    if (!safePath(file)) reject(origin, ordinal, 'path-reference-unsafe');
    if (hasBlockedSddAncestor(file, referenceIndex)) reject(origin, ordinal, 'path-reference-blocked');
    const isDirectory = inventory.directories.has(file) || referenceIndex.futureDirectories.has(file);
    if (directory && !isDirectory) reject(origin, ordinal, 'path-reference-directory');
    if (!inventory.files.has(file) && !isDirectory && !proposed.has(file)) reject(origin, ordinal, 'path-reference-missing');
  };
  // Relative Markdown file links resolve against the selected SDD, never the current checkout.
  let linkOrdinal = 0;
  for (const destination of references.destinations) {
    linkOrdinal++;
    const href = destination.split(/[?#]/u)[0];
    if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/)/iu.test(href)) continue;
    let decoded: string;
    try { decoded = decodeURIComponent(href); } catch {
      return fail('repository-path', { detail: 'path-link', section: 0 }, [{ detail: 'path-link-reference', section: 0, row: linkOrdinal }]);
    }
    const directory = decoded.endsWith('/');
    if (directory) decoded = decoded.slice(0, -1);
    const parts = sddPath.split('/').slice(0, -1);
    for (const part of decoded.split('/')) {
      if (part === '..') {
        if (!parts.length) fail('repository-path', { detail: 'path-link', section: 0 }, [{ detail: 'path-link-reference', section: 0, row: linkOrdinal }]);
        parts.pop();
      }
      else if (part !== '.') parts.push(part);
    }
    check(parts.join('/'), 'path-link-reference', linkOrdinal, directory);
  }
  let inlineOrdinal = 0;
  let text = '';
  let context = '';
  for (const part of references.parts) {
    if (part.kind === 'text') { text += part.value; context = appendSddReferenceContext(context, part.value); continue; }
    inlineOrdinal++;
    const value = part.value;
    const prefix = sddReferencePrefix(context, context.length);
    context = '`'; // A prior code span cannot become the next value's URL/File label.
    if (!value.includes('/') || isSddNonFileNotation(value, prefix, referenceIndex)) {
      text += ' '.repeat(value.length + 2);
    } else if (!/\s/u.test(value) || isSddFileRole(prefix) || isKnownSddRepositoryReference(value, referenceIndex)) {
      check(value.replace(/\/$/u, ''), 'path-inline-reference', inlineOrdinal, value.endsWith('/'));
      text += ' '.repeat(value.length + 2);
    } else text += '`' + value + '`';
  }
  const prose = text.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s)>]+/giu, '');
  let proseOrdinal = 0;
  for (const match of prose.matchAll(/(?<![\w./:@-])(@?[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+\.[A-Za-z0-9]+)(?![\w/-])/gu)) {
    proseOrdinal++;
    if (!isSddNonFileNotation(match[1], sddReferencePrefix(prose, match.index), referenceIndex)) {
      check(match[1], 'path-prose-reference', proseOrdinal);
    }
  }
}

function uniqueIdentifiers(values: readonly string[], pattern: RegExp, reason: 'case-identity' | 'requirement-mapping', section: 4 | 14): void {
  const distinct = new Set(values).size;
  if (distinct !== values.length) fail(reason, { detail: reason === 'case-identity' ? 'case-identity' : 'requirement-identity', section, expected: values.length, observed: distinct });
  const invalid = values.findIndex(value => !pattern.test(value));
  if (invalid >= 0) fail(reason, { detail: 'identifier-list', section, row: invalid + 1, expected: 0, observed: values.filter(value => !pattern.test(value)).length });
}
