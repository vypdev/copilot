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
