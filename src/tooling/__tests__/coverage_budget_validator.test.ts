const {
    DEFAULT_THRESHOLDS,
    coverageBudgetFailures,
    normalizeBudgetConfiguration,
    validateCoverageBudget,
} = require('../../../scripts/validate-coverage-budgets.cjs');

interface CoverageMetric {
    readonly covered: number;
    readonly pct: number;
    readonly total: number;
}

type FileCoverage = Readonly<Record<'branches' | 'functions' | 'lines' | 'statements', CoverageMetric>>;

interface CoverageRule {
    readonly expectedFileCount?: number;
    readonly failureLabel?: string;
    readonly files?: readonly string[];
    readonly fileKind?: string;
    readonly mode: 'aggregate' | 'each';
    readonly pathIncludes?: string;
    readonly thresholds: Readonly<Record<string, number>>;
}

function metric(covered: number, total = 100): CoverageMetric {
    return { covered, pct: total === 0 ? 100 : covered / total * 100, total };
}

function coverage(covered: number, total = 100): FileCoverage {
    return {
        branches: metric(covered, total),
        functions: metric(covered, total),
        lines: metric(covered, total),
        statements: metric(covered, total),
    };
}

function summary(files: Readonly<Record<string, FileCoverage>>): Readonly<Record<string, FileCoverage>> {
    return Object.fromEntries(Object.entries(files).map(([file, value]) => [`/repo/${file}`, value]));
}

function fixtureConfiguration(rule: CoverageRule) {
    return {
        missingEntryLabel: 'fixture',
        name: 'Fixture',
        rules: [rule],
        successMessage: 'unused',
    };
}

function rawConfiguration(ruleOverrides: Readonly<Record<string, unknown>> = {}) {
    return {
        budgets: [{
            missingEntryLabel: 'fixture',
            name: 'Fixture',
            rules: [{
                files: ['src/fixture.ts'],
                mode: 'aggregate',
                thresholdProfile: 'default',
                ...ruleOverrides,
            }],
            successMessage: 'fixture coverage: PASS',
        }],
    };
}

describe('coverage budget validator', () => {
    it('accepts an aggregate exactly on every threshold', () => {
        const report = summary({
            'src/high.ts': coverage(100),
            'src/low.ts': {
                branches: metric(80),
                functions: metric(80),
                lines: metric(90),
                statements: metric(90),
            },
        });

        expect(coverageBudgetFailures(report, '/repo', fixtureConfiguration({
            files: ['src/high.ts', 'src/low.ts'],
            mode: 'aggregate',
            thresholds: DEFAULT_THRESHOLDS,
        }))).toEqual([]);
    });

    it('reports the labelled aggregate metric below its boundary', () => {
        expect(coverageBudgetFailures(
            summary({ 'src/low.ts': coverage(89) }),
            '/repo',
            fixtureConfiguration({
                failureLabel: 'changed path',
                files: ['src/low.ts'],
                mode: 'aggregate',
                thresholds: { lines: 90 },
            }),
        )).toEqual(['changed path lines 89.00% < 90%']);
    });

    it('reports each file independently when configured in each mode', () => {
        expect(coverageBudgetFailures(
            summary({ 'src/low.ts': coverage(89) }),
            '/repo',
            fixtureConfiguration({
                files: ['src/low.ts'],
                mode: 'each',
                thresholds: { functions: 90 },
            }),
        )).toEqual(['src/low.ts functions 89% < 90%']);
    });

    it('rejects a missing explicit coverage entry', () => {
        expect(() => validateCoverageBudget(fixtureConfiguration({
            files: ['src/missing.ts'], mode: 'aggregate', thresholds: { lines: 90 },
        }), { repositoryRoot: '/repo', silent: true, summary: {} }))
            .toThrow('Missing fixture coverage entry for src/missing.ts.');
    });

    it('rejects drift in a discovered file-count contract', () => {
        expect(() => validateCoverageBudget(fixtureConfiguration({
            expectedFileCount: 2,
            fileKind: 'fixture files',
            mode: 'aggregate',
            pathIncludes: 'src/fixtures/',
            thresholds: { lines: 90 },
        }), {
            repositoryRoot: '/repo',
            silent: true,
            summary: summary({ 'src/fixtures/one.ts': coverage(100) }),
        })).toThrow('Expected coverage for exactly 2 fixture files, received 1.');
    });

    it('treats a zero-total aggregate metric as fully covered', () => {
        expect(coverageBudgetFailures(
            summary({ 'src/empty.ts': coverage(0, 0) }),
            '/repo',
            fixtureConfiguration({
                files: ['src/empty.ts'],
                mode: 'aggregate',
                thresholds: { functions: 100 },
            }),
        )).toEqual([]);
    });

    it.each([
        ['an empty budget inventory', { budgets: [] }, 'must declare at least one budget'],
        ['an unknown mode', rawConfiguration({ mode: 'partial' }), 'has unknown mode: partial'],
        ['an empty explicit inventory', rawConfiguration({ files: [] }), 'must select explicit files'],
        ['ambiguous selectors', rawConfiguration({ pathIncludes: 'src/', expectedFileCount: 1 }), 'must select explicit files'],
        ['duplicate files', rawConfiguration({ files: ['src/fixture.ts', 'src/fixture.ts'] }), 'contains duplicate files'],
        ['an unknown threshold profile', rawConfiguration({ thresholdProfile: 'relaxed' }), 'Unknown coverage threshold profile'],
    ])('rejects %s in checked-in configuration', (_case, configuration, message) => {
        expect(() => normalizeBudgetConfiguration(configuration)).toThrow(message);
    });

    it('rejects duplicate budget names', () => {
        const [budget] = rawConfiguration().budgets;
        expect(() => normalizeBudgetConfiguration({ budgets: [budget, budget] }))
            .toThrow('Coverage configuration contains duplicate budget names.');
    });
});
