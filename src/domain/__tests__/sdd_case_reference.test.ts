import { countSddShorthandCaseReferences as count } from '../sdd_case_reference';

describe('SDD shorthand reference roles', () => {
  it.each([
    ['sdd-case-ref-C01', 'Existing household DEL/C1 read compatibility remains separate from stronger new-setup input validation.'],
    ['sdd-case-ref-C02', 'The Unicode C1 control set remains readable.'],
    ['sdd-case-ref-C03', 'Connector C1 is connected to component C2, C3 and C4.'],
    ['sdd-case-ref-C04', 'The register `C1` supplies the value.'],
    ['sdd-case-ref-C05', '| Component | Designator |\n|---|---|\n| Connector | C1 |'],
    ['sdd-case-ref-C06', '| Case ID | Scenario |\n|---|---|\n| fixture-C01 | C1 controls remain readable. |'],
    ['sdd-case-ref-C07', '| Requirement | Behavior |\n|---|---|\n| G-01 | Preserve Unicode C1. |'],
    ['sdd-case-ref-C08', 'The endpoint URI is `/api/C1`; the model C2 is unrelated.'],
    ['unicode-left-boundary', 'πC1 is an identifier.'],
    ['unicode-right-boundary', 'C1β and C1\u0301 are identifiers.'],
    ['compound-technical-reference', 'See C1-component for the connector model.'],
    ['compound-paired-designators', 'See C1-C2-component for the connector model.'],
    ['compound-identifier', 'C1-component and component-C1-name are operands.'],
    ['case-sensitive-prefix-word', 'The casesensitive parameter C1 has no case-reference label.'],
    ['reference-technical-role', 'See connector C1 and component C2.'],
    ['description-not-continuation', 'fixture-C01: Unicode C1 controls remain readable.'],
    ['case-scenario-no-spill', '| Case ID | Scenario |\n|---|---|\n| fixture-C01 | C1 controls |\n| fixture-C02 | C2 controls |'],
    ['header-no-spill', '| Cases | Scenario |\n|---|---|\n| fixture-C01 | C1 |'],
    ['prose-after-table', '| Cases | Notes |\n|---|---|\n| fixture-C01 | Case |\n\nC1 controls remain readable.'],
    ['link-destination-is-not-a-case', 'Cases [overview](https://example.invalid/C1) remain separate.'],
    ['paragraph-after-block', '> | Cases | Notes |\n> |---|---|\n> | fixture-C01 | X |\n\nThe connector C1 is separate.'],
  ])('%s retains technical prose without inventing a case', (_id, source) => expect(count(source)).toBe(0));

  it.each([
    ['sdd-case-ref-C09', 'Cases C01 and C02 establish acceptance.', 2],
    ['sdd-case-ref-C10', 'Casos de prueba C01 y C02.', 2],
    ['sdd-case-ref-C11', 'Case **ID**: `C01`.', 1],
    ['sdd-case-ref-C12', '| Case ID | Owner |\n|---|---|\n| C01 | Fixture |', 1],
    ['sdd-case-ref-C13', 'Reference fixture-C01, C02 and C03.', 2],
    ['sdd-case-ref-C14', 'Cases C01–C48 establish acceptance.', 2],
    ['sdd-case-ref-C15', 'See C01.', 1],
    ['sdd-case-ref-C16', 'Case C01-C48.', 1],
    ['sdd-case-ref-C17', 'Cases:\n- C01\n- C02', 2],
    ['sdd-case-ref-C18', '**Cases**: [`C01`](#details), `C02`.', 2],
    ['line-wrapped-list', 'Cases C01,\n C02 or C03.', 3],
    ['multiple-range-endpoints', 'Cases C01-C02-C03.', 1],
    ['numeric-range-endpoint', 'Cases C01-48.', 1],
    ['case-number', 'Case no. C01.', 1],
    ['spanish-reference', 'Véase C01.', 1],
    ['covered-by', 'This behavior is covered by C01.', 1],
    ['table-case-list', '| Requirement | Cases |\n|---|---|\n| G-01 | fixture-C01, C02 |', 1],
    ['decorated-column', '| **Case IDs** | Scenario |\n|---|---|\n| C01 | Unicode C1 |', 1],
    ['linked-column', '| [Case ID](#cases) | Scenario |\n|---|---|\n| C01 | Unicode C1 |', 1],
    ['reference-column', '| Case references | Scenario |\n|---|---|\n| C01 | Unicode C1 |', 1],
    ['header-without-outer-pipes', 'Case ID | Scenario\n---|---\nC01 | Unicode C1', 1],
    ['body-without-pipes', '| Case ID | Scenario |\n|---|---|\nC01', 1],
    ['gfm-single-dash', '| Cases | Notes |\n|:-:|---|\n| C01 | Fixture |', 1],
    ['quoted-table', '> | Case ID | Scenario |\n> |---|---|\n> | C01 | Unicode C1 |', 1],
    ['list-table', '- | Case ID | Scenario |\n  |---|---|\n  | C01 | Unicode C1 |', 1],
    ['escaped-pipe-does-not-shift-role', '| Scenario | Cases |\n|---|---|\n| Unicode \\| C1 | C02 |', 1],
    ['escaped-backslash-before-delimiter', '| Cases | Scenario |\n|---|---|\n| C01 \\\\| Unicode C1 |', 1],
    ['qualified-link-continuation', 'See [fixture-C01](#details), C02.', 1],
    ['quote-tab-table', '>\t| Case ID | Scenario |\n>\t|---|---|\n>\t| C01 | Unicode C1 |', 1],
    ['single-case-column', '| Cases |\n|---|\n| C01 |', 1],
  ])('%s rejects only shorthand that acquired a reference role', (_id, source, expected) => expect(count(source)).toBe(expected));

  it('sdd-case-ref-C20 treats line endings equivalently', () => {
    const source='Cases:\n- C01\n- C02\n\nComponent C3.';
    expect(count(source)).toBe(2); expect(count(source.replace(/\n/gu,'\r\n'))).toBe(2); expect(count(source.replace(/\n/gu,'\r'))).toBe(2);
  });
  it('sdd-case-ref-C23 does not carry regex cursor or role state between calls', () => {
    for (let index=0;index<3;index++) { expect(count('Cases C01.')).toBe(1); expect(count('Connector C1.')).toBe(0); }
  });
  it('sdd-case-ref-C24 has no silently dropped prefix or spacing window', () => {
    expect(count('Connector C1, C2. '.repeat(4000))).toBe(0);
    expect(count('Cases:'+ ' '.repeat(50_000)+'C01')).toBe(1);
  });
  it('does not infer a typed column from a malformed delimiter row', () => {
    expect(count('| Component | Value |\n| --- |\n| Connector | C1 |')).toBe(0);
  });
  it('does not treat a paragraph with a lone pipe as a case-role table', () => {
    expect(count('|\n|\nUnicode C1.')).toBe(0);
  });
});
