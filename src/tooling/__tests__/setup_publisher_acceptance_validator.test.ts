import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

type Report = { testResults: { name: string; assertionResults: { fullName: string; status: string }[] }[] };
type Ledger = { schemaVersion: number; cases: { id: string; area: string; requirements: string[]; assertion: string;
    gate: string; evidence: { file: string; test: string }[] }[] };

const root = resolve(__dirname, '../../..');
const omitted = Symbol('omitted report');

describe('publisher acceptance report execution boundary', () => {
    let directory: string;
    let next = 0;
    beforeAll(() => { directory = realpathSync(mkdtempSync(join(tmpdir(), 'copilot-publisher-report-test-'))); });
    afterAll(() => { rmSync(directory, { recursive: true, force: true }); });

    function run(report: unknown = omitted, runtimeRoot = root) {
        const args = [join(runtimeRoot, 'scripts/validate-setup-publisher-acceptance.cjs')];
        if (report !== omitted) {
            const file = join(directory, `report-${next++}.json`);
            const contents = JSON.stringify(report);
            if (contents === undefined) throw new Error('Invalid test fixture.');
            writeFileSync(file, contents);
            args.push(file);
        }
        const env = Object.fromEntries(Object.entries(process.env)
            .filter(([key]) => ['PATH', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP'].includes(key)));
        return spawnSync(process.execPath, args, { cwd: runtimeRoot, env, encoding: 'utf8' });
    }

    function currentLedger(): Ledger {
        return JSON.parse(readFileSync(join(root, 'specs/setup-publisher-installation-acceptance.json'), 'utf8')) as Ledger;
    }

    function syntheticCompleteReport(ledger = currentLedger(), runtimeRoot = root): Report {
        // A parser fixture only; this does not claim the mapped feature tests ran.
        const suites = new Map<string, Report['testResults'][number]>();
        for (const item of ledger.cases.filter(item => item.gate === 'jest')) {
            for (const evidence of item.evidence) {
                const name = join(runtimeRoot, evidence.file);
                const suite = suites.get(name) ?? { name, assertionResults: [] };
                suite.assertionResults.push({ fullName: evidence.test, status: 'passed' });
                suites.set(name, suite);
            }
        }
        return { testResults: [...suites.values()] };
    }

    function extendedFixture() {
        const runtimeRoot = join(directory, `ledger-${next++}`), ledger = currentLedger();
        const originalCount = ledger.cases.length;
        const tests = ['synthetic parser fixture extra acceptance alpha', 'synthetic parser fixture extra acceptance beta'];
        for (const [index, test] of tests.entries()) ledger.cases.push({ id: `publisher977-C${originalCount + index + 1}`,
            area: 'Application/recovery', requirements: ['PU977-G04'], assertion: test, gate: 'jest',
            evidence: [{ file: 'src/tooling/__tests__/setup_publisher_acceptance_validator.test.ts', test }] });
        const files = new Set(['scripts/validate-setup-publisher-acceptance.cjs', 'scripts/setup-acceptance-path.cjs',
            'specs/setup-bugbot-publisher-manifest-route.md', 'specs/organization-configuration-reuse-and-batch-setup.md',
            ...ledger.cases.flatMap(item => item.evidence.map(evidence => evidence.file))]);
        for (const file of files) {
            mkdirSync(dirname(join(runtimeRoot, file)), { recursive: true });
            copyFileSync(join(root, file), join(runtimeRoot, file));
        }
        const report = syntheticCompleteReport(ledger, runtimeRoot);
        const execute = () => {
            writeFileSync(join(runtimeRoot, 'specs/setup-publisher-installation-acceptance.json'), JSON.stringify(ledger));
            return run(report, runtimeRoot);
        };
        return { ledger, report, execute, originalCount, runtimeRoot };
    }

    it('admits meaningful evidence beyond both published acceptance floors', () => {
        const f = extendedFixture(), result = f.execute();
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toContain(`${f.ledger.cases.length - 4}/${f.ledger.cases.length - 4} mapped Jest cases passed`);
    });

    it.each(['missing-original', 'duplicate-extra', 'foreign-requirement', 'wrong-gate', 'skipped-extra'] as const)(
        'retains acceptance integrity when an expanded ledger has %s', kind => {
            const f = extendedFixture(), extra = f.ledger.cases[f.originalCount];
            if (kind === 'missing-original') f.ledger.cases.shift();
            if (kind === 'duplicate-extra') f.ledger.cases[f.originalCount + 1].id = extra.id;
            if (kind === 'foreign-requirement') extra.requirements = ['PU977-FOREIGN'];
            if (kind === 'wrong-gate') extra.gate = 'npm-package-smoke';
            if (kind === 'skipped-extra') {
                const assertion = f.report.testResults.flatMap(suite => suite.assertionResults)
                    .find(item => item.fullName === extra.evidence[0].test)!;
                assertion.status = 'pending';
            }
            const result = f.execute();
            expect(result.status).toBe(1); expect(result.stdout).not.toContain('mapped Jest cases passed');
        });

    it.each(['publisher977-C67', 'publisher977-C90', 'publisher977-C91'])('rejects omission of required owning-appendix case %s', id => {
        const f = extendedFixture(); f.ledger.cases = f.ledger.cases.filter(item => item.id !== id);
        const result = f.execute(); expect(result.status).toBe(1);
        expect(result.stderr).toContain('Every selected SDD and owning appendix case must remain registered');
    });

    it('rejects a baseline-only ledger that omits the owning regression budget', () => {
        const f = extendedFixture(); f.ledger.cases = f.ledger.cases.slice(0, 64);
        const result = f.execute(); expect(result.status).toBe(1);
        expect(result.stderr).toContain('Every selected SDD and owning appendix case must remain registered');
    });

    it('retains the cumulative floor when both appendix rows and matching ledger cases are removed', () => {
        const f = extendedFixture(); f.ledger.cases = f.ledger.cases.slice(0, 64);
        const path = join(f.runtimeRoot, 'specs/organization-configuration-reuse-and-batch-setup.md');
        writeFileSync(path, readFileSync(path, 'utf8').split('\n').filter(line => !line.startsWith('| publisher977-C')).join('\n'));
        const result = f.execute(); expect(result.status).toBe(1);
        expect(result.stderr).toContain('Expected v1 ledger with at least');
        expect(result.stdout).not.toContain('mapped Jest cases passed');
    });

    it('rejects a duplicate published ID instead of allowing a contract override', () => {
        const f = extendedFixture(), path = join(f.runtimeRoot, 'specs/organization-configuration-reuse-and-batch-setup.md');
        const row = readFileSync(path, 'utf8').split('\n').find(line => line.startsWith('| publisher977-C65'))!;
        writeFileSync(path, readFileSync(path, 'utf8') + '\n' + row + '\n');
        const result = f.execute(); expect(result.status).toBe(1); expect(result.stderr).toContain('duplicate published contract');
    });

    it.each([
        ['publisher977-C27', 'specs/setup-bugbot-publisher-manifest-route.md'],
        ['publisher977-C92', 'specs/organization-configuration-reuse-and-batch-setup.md'],
        ['publisher977-C95', 'specs/organization-configuration-reuse-and-batch-setup.md'],
        ['publisher977-C100', 'specs/organization-configuration-reuse-and-batch-setup.md'],
        ['publisher977-C103', 'specs/organization-configuration-reuse-and-batch-setup.md'],
    ])('rejects a missing required publication row %s while retaining its ledger evidence', (id, file) => {
        const f = extendedFixture(), path = join(f.runtimeRoot, file);
        writeFileSync(path, readFileSync(path, 'utf8').split('\n')
            .filter(line => !line.startsWith(`| ${id} |`)).join('\n'));
        const result = f.execute();
        expect(result.status).toBe(1); expect(result.stderr).toContain(`${id}: missing required published contract`);
        expect(result.stdout).not.toContain('mapped Jest cases passed');
    });

    it('keeps registration-only mode exclusive to an omitted report argument', () => {
        const result = run();
        expect(result.status).toBe(0);
        expect(result.stdout).toContain(`${currentLedger().cases.length} cases registered; execution is not established`);
        expect(result.stdout).not.toContain('mapped Jest cases passed');
    });

    it.each([null, false, 0, '', [], {}, { testResults: null }, { testResults: {} }])(
        'fails closed for a supplied report without a test-results array: %j', report => {
            const result = run(report);
            expect(result.status).toBe(1);
            expect(result.stderr).toContain('supplied report');
            expect(result.stdout).not.toContain('cases registered');
            expect(result.stdout).not.toContain('mapped Jest cases passed');
        });

    it('rejects a valid report envelope that has no executed assertions', () => {
        const result = run({ testResults: [] });
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('named assertion absent, failed or skipped');
    });

    it('checks every named assertion in a complete synthetic report', () => {
        const result = run(syntheticCompleteReport());
        expect(result.status).toBe(0);
        const count = currentLedger().cases.filter(item => item.gate === 'jest').length;
        expect(result.stdout).toContain(`${count}/${count} mapped Jest cases passed`);
        expect(result.stdout).not.toContain('cases registered');
    });

    it.each(['failed', 'pending', 'missing'])('rejects a %s named assertion in an otherwise complete report', status => {
        const report = syntheticCompleteReport();
        if (status === 'missing') report.testResults[0].assertionResults.shift();
        else report.testResults[0].assertionResults[0].status = status;
        const result = run(report);
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('named assertion absent, failed or skipped');
        expect(result.stdout).not.toContain('mapped Jest cases passed');
    });
});
