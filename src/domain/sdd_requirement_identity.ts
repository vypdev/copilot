import { SddDraftFormatFailure } from './pre_branch_sdd';

export const SDD_REQUIREMENT_ID = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+$/u;
export const SDD_REQUIREMENT_ID_INSTRUCTIONS = 'Requirement IDs must have hyphen-separated alphanumeric segments, start with a letter, and include at least one hyphen. Use G-01 or PAY-02, never G01 or G1.';
export type SddRequirementReservations = ReadonlyMap<string, ReadonlySet<string>>;

export function validateSddRequirementIds(ids: readonly string[], section: 4 | 14, row?: number): void {
  const invalid = ids.findIndex(id => !SDD_REQUIREMENT_ID.test(id));
  if (invalid >= 0) {
    throw new SddDraftFormatFailure('requirement-mapping', 'A requirement identifier must use the hyphenated grammar.', {
      reason: 'requirement-mapping', phase: 'validation',
      facts: [{ detail: 'identifier-list', section, row: row ?? invalid + 1, expected: 0,
        observed: ids.filter(id => !SDD_REQUIREMENT_ID.test(id)).length }],
    });
  }
}

/** An appendix may cite the same definition. A different meaning needs a new identity. */
export function validateSddRequirementReservations(rows: readonly (readonly string[])[], reserved: SddRequirementReservations, row?: number): void {
  const conflicts = rows.flatMap(([id, behavior], index) => {
    const prior = reserved.get(id);
    return prior && (prior.size !== 1 || !prior.has(behavior)) ? [index + 1] : [];
  });
  if (conflicts.length) {
    throw new SddDraftFormatFailure('requirement-mapping', 'An existing requirement identifier has a different definition.', {
      reason: 'requirement-mapping', phase: 'validation',
      facts: [{ detail: 'requirement-reserved', section: 4, row: row ?? conflicts[0], expected: 0, observed: conflicts.length }],
    });
  }
}
