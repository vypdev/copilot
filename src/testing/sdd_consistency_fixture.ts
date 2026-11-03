/** Visible canonical tables shared by pure consistency and real Git publication fixtures. */
export function sddConsistencyFixture(prefix = 'payments-change', sddPath = 'specs/change.md', change: 'create' | 'update' = 'create'): string {
  return `# Payment behavior

- Status: Draft
- Owners: Maintainers

## 1. Executive summary
${'Preserve authorization, immutable evidence and the existing owning product contract. '.repeat(18)}

## 4. Goals
| Requirement | Behavior |
|---|---|
| G-01 | Reject missing credentials and accept valid credentials. |
| G-02 | Preserve the accepted principal through publication. |

## 8. Clean Architecture
The domain owns pure decisions; the workspace adapter reads immutable Git objects and the application coordinates validation before publication.

## 14. Testing strategy
| Area | Minimum distinct cases | Behaviors/risks covered |
|---|---:|---|
| Policy | 2 | Authentication |
| Adapter | 1 | Publication |
| **Total** | **3** | No double counting |

| Case ID | Area | Requirements | Scenario |
|---|---|---|---|
| ${prefix}-C01 | Policy | G-01 | Missing credentials return 401. |
| ${prefix}-C02 | Policy | G-01 | Valid credentials produce an accepted principal. |
| ${prefix}-C03 | Adapter | G-02 | Publishing preserves the principal. |

## 15. Documentation
| Path | Change |
|---|---|
| docs/payments.mdx | update |
| ${sddPath} | ${change} |

## 16. Acceptance scenarios
The three cases above are observable product outcomes; runtime and security review remain separate acceptance gates.

## 17. Requirements traceability
| Requirement | Cases |
|---|---|
| G-01 | ${prefix}-C01, ${prefix}-C02 |
| G-02 | ${prefix}-C03 |
`;
}

/** Forty-eight hypothetical input rows; these are not forty-eight executed SDK regressions. */
export function sddCaseReferenceFixture(prose: string, sddPath = 'specs/change.md', change: 'create' | 'update' = 'create'): string {
  const prefix = 'entry-prose';
  const cases = Array.from({ length: 48 }, (_, index) => `${prefix}-C${String(index + 1).padStart(2, '0')}`);
  const budget = '| Area | Minimum distinct cases | Behaviors/risks covered |\n|---|---:|---|\n| Policy | 24 | First fixture group |\n| Adapter | 24 | Second fixture group |\n| Total | 48 | No double counting |\n\n';
  const inventory = '| Case ID | Area | Requirements | Scenario |\n|---|---|---|---|\n'
    + cases.map((id, index) => `| ${id} | ${index < 24 ? 'Policy | G-01' : 'Adapter | G-02'} | Independent fixture outcome ${index + 1}. |`).join('\n') + '\n\n';
  const reverse = '| Requirement | Cases |\n|---|---|\n| G-01 | ' + cases.slice(0, 24).join(', ') + ' |\n| G-02 | ' + cases.slice(24).join(', ') + ' |\n';
  return sddConsistencyFixture(prefix, sddPath, change)
    .replace('## 8.', '## 6. Functional behavior\n' + prose + '\n\n## 8.')
    .replace(/\| Area \| Minimum distinct cases[\s\S]*?(?=\| Case ID)/u, () => budget)
    .replace(/\| Case ID \| Area[\s\S]*?(?=## 15\.)/u, () => inventory)
    .replace(/\| Requirement \| Cases \|[\s\S]*$/u, () => reverse);
}
