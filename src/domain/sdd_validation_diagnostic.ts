/** Public diagnostics contain only closed checks and bounded ordinal/count facts. */
export const SDD_DRAFT_FORMAT_REASONS = Object.freeze([
  'required-heading', 'test-budget', 'case-identity', 'case-budget', 'requirement-mapping', 'repository-path',
] as const);
export type SddDraftFormatReason = typeof SDD_DRAFT_FORMAT_REASONS[number];
export const SDD_VALIDATION_DETAILS = Object.freeze([
  'validation-contract', 'size-limit', 'response-shape', 'minimum-length', 'required-heading', 'numeric-budget',
  'section-count', 'table-count', 'table-separator', 'table-columns', 'table-empty-cell', 'table-empty',
  'derived-slot-count', 'derived-slot-placement',
  'identifier-list', 'requirement-identity', 'case-identity', 'case-reserved', 'case-reference', 'case-shorthand',
  'budget-area', 'budget-integer', 'budget-order', 'budget-total', 'budget-distribution',
  'requirement-reference', 'requirement-coverage', 'traceability-links', 'traceability-membership', 'traceability-requirement',
  'owner-path', 'path-identity', 'create-existing-path', 'create-path-overlap', 'create-path-parent',
  'path-operation', 'path-reference', 'path-link',
  'path-inline-reference', 'path-prose-reference', 'path-link-reference',
  'path-reference-unsafe', 'path-reference-blocked', 'path-reference-missing', 'path-reference-directory',
] as const);
export type SddValidationDetail = typeof SDD_VALIDATION_DETAILS[number];
export interface SddValidationFact {
  readonly detail: SddValidationDetail;
  readonly section: 0 | 4 | 14 | 15 | 17;
  readonly row?: number;
  readonly expected?: number;
  readonly observed?: number;
}
export interface SddValidationDiagnostic {
  readonly reason: SddDraftFormatReason | 'size' | 'response-shape' | 'response-minimum';
  readonly phase: 'response' | 'assembly' | 'validation';
  readonly facts: readonly SddValidationFact[];
}
const REASONS: readonly string[] = [...SDD_DRAFT_FORMAT_REASONS, 'size', 'response-shape', 'response-minimum'];
const PHASES: readonly string[] = ['response', 'assembly', 'validation'];

export interface SddDraftMinimumDiagnostic {
  readonly minimum: number;
  readonly observed: number | 'unavailable';
  readonly attempts: 1 | 2;
}

/** Counts authorize no publication and never carry the rejected response. */
export function isSddDraftMinimumDiagnostic(input: unknown): input is SddDraftMinimumDiagnostic {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).sort().join(',') !== 'attempts,minimum,observed') return false;
  const value = input as Readonly<Record<string, unknown>>;
  return boundedInteger(value.minimum, 1)
    && (value.observed === 'unavailable' || (boundedInteger(value.observed, 0) && Number(value.observed) < Number(value.minimum)))
    && (value.attempts === 1 || value.attempts === 2);
}

/** Fail closed on extra fields, arbitrary text, unbounded facts or invalid coordinates. */
export function normalizeSddValidationDiagnostic(input: SddValidationDiagnostic): SddValidationDiagnostic {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).sort().join(',') !== 'facts,phase,reason'
    || !REASONS.includes(input.reason) || !PHASES.includes(input.phase)
    || !Array.isArray(input.facts) || input.facts.length < 1 || input.facts.length > 8) {
    throw new TypeError('Invalid bounded SDD validation diagnostic.');
  }
  const facts = input.facts.map(fact => {
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)
      || Object.keys(fact).some(key => !['detail', 'section', 'row', 'expected', 'observed'].includes(key))
      || !SDD_VALIDATION_DETAILS.includes(fact.detail) || ![0, 4, 14, 15, 17].includes(fact.section)
      || (fact.row !== undefined && !boundedInteger(fact.row, 1))
      || (fact.expected !== undefined && !boundedInteger(fact.expected, 0))
      || (fact.observed !== undefined && !boundedInteger(fact.observed, 0))) {
      throw new TypeError('Invalid bounded SDD validation fact.');
    }
    return Object.freeze({ ...fact });
  });
  if (input.reason === 'response-minimum' && (input.phase !== 'response' || facts.length !== 1
    || facts[0].detail !== 'minimum-length' || facts[0].section !== 0 || facts[0].row !== undefined
    || !isSddDraftMinimumDiagnostic({ minimum: facts[0].expected, observed: facts[0].observed ?? 'unavailable', attempts: 1 }))) {
    throw new TypeError('Invalid bounded SDD minimum diagnostic.');
  }
  return Object.freeze({ reason: input.reason, phase: input.phase, facts: Object.freeze(facts) });
}

function boundedInteger(value: unknown, minimum: number): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum && value <= 100_000;
}
