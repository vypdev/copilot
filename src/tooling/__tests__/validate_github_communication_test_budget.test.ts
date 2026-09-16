interface CommunicationBudgetLedger {
  readonly version: number;
  readonly baseline: string;
  readonly budgets: readonly {
    readonly id: string;
    readonly spec: string;
    readonly requiredCases: number;
    readonly allocatedCases: number;
    readonly files: readonly { readonly path: string; readonly qualifyingCases: number }[];
  }[];
}

interface CommunicationBudgetValidator {
  countQualifyingDeclarations(root: string, baseline: string, testPath: string): number;
  readLedger(root?: string): CommunicationBudgetLedger;
  validateCommunicationTestBudget(root: string, ledger: CommunicationBudgetLedger): string[];
}

const {
  countQualifyingDeclarations,
  readLedger,
  validateCommunicationTestBudget,
} = require('../../../scripts/validate-github-communication-test-budget.cjs') as CommunicationBudgetValidator;

function mutableLedger(): any {
  return structuredClone(readLedger(process.cwd()));
}

describe('GitHub communication test-budget validator', () => {
  it('keeps both specification budgets above target with disjoint test files', () => {
    const ledger = readLedger(process.cwd());

    expect(validateCommunicationTestBudget(process.cwd(), ledger)).toEqual([]);
    expect(ledger.budgets.map(budget => ({
      id: budget.id,
      allocated: budget.allocatedCases,
      required: budget.requiredCases,
    }))).toEqual([
      { id: 'semantic-github-publication', allocated: 160, required: 128 },
      { id: 'repository-locale-localization', allocated: 141, required: 136 },
    ]);
    for (const budget of ledger.budgets) {
      for (const entry of budget.files) {
        expect(countQualifyingDeclarations(process.cwd(), ledger.baseline, entry.path))
          .toBeGreaterThanOrEqual(entry.qualifyingCases);
      }
    }
  });

  it('rejects cross-budget test-file double counting', () => {
    const ledger = mutableLedger();
    ledger.budgets[1].files[0].path = ledger.budgets[0].files[0].path;

    expect(validateCommunicationTestBudget(process.cwd(), ledger)).toContain(
      `${ledger.budgets[0].files[0].path} is allocated to more than one communication budget.`,
    );
  });

  it('rejects an allocation total that no longer matches its evidence rows', () => {
    const ledger = mutableLedger();
    ledger.budgets[0].allocatedCases -= 1;

    expect(validateCommunicationTestBudget(process.cwd(), ledger)).toContain(
      'semantic-github-publication allocatedCases is 159 but its file allocation totals 160.',
    );
  });

  it('rejects unsafe paths and case allocations larger than the retained tests', () => {
    const ledger = mutableLedger();
    ledger.budgets[0].files[0] = { path: '../outside.test.ts', qualifyingCases: 999 };
    ledger.budgets[0].files[1].qualifyingCases = 999;

    const errors = validateCommunicationTestBudget(process.cwd(), ledger);

    expect(errors).toContain('semantic-github-publication has an invalid test path: ../outside.test.ts.');
    expect(errors).toContain(
      'src/domain/__tests__/git_object_id.test.ts has 2 qualifying test declarations since 0bb83b75^, below its allocation of 999.',
    );
  });
});
