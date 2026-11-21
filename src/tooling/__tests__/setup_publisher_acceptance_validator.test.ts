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
        ledger.cases = ledger.cases.slice(0, 64);
        const tests = ['finalizes a retained PR-complete applying operation after exact read-only verification',
            'reports failed terminal reconciliation without overstating the last durable PR-complete state'];
        for (const [index, test] of tests.entries()) ledger.cases.push({ id: `publisher977-C${65 + index}`,
            area: 'Application/recovery', requirements: ['PU977-G04'], assertion: test, gate: 'jest',
            evidence: [{ file: 'src/application/usecases/setup/__tests__/apply_setup_publisher_use_case.test.ts', test }] });
        const files = new Set(['scripts/validate-setup-publisher-acceptance.cjs', 'scripts/setup-acceptance-path.cjs',
            'specs/setup-bugbot-publisher-manifest-route.md', ...ledger.cases.flatMap(item => item.evidence.map(evidence => evidence.file))]);
        for (const file of files) {
            mkdirSync(dirname(join(runtimeRoot, file)), { recursive: true });
            copyFileSync(join(root, file), join(runtimeRoot, file));
        }
        const report = syntheticCompleteReport(ledger, runtimeRoot);
        const execute = () => {
            writeFileSync(join(runtimeRoot, 'specs/setup-publisher-installation-acceptance.json'), JSON.stringify(ledger));
            return run(report, runtimeRoot);
        };
        return { ledger, report, execute };
    }

    it('admits meaningful C65 and C66 evidence beyond the immutable 64-case floor', () => {
        const f = extendedFixture(), result = f.execute();
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toContain('62/62 mapped Jest cases passed');
    });

    it.each(['missing-original', 'duplicate-extra', 'foreign-requirement', 'wrong-gate', 'skipped-extra'] as const)(
        'retains acceptance integrity when an expanded ledger has %s', kind => {
            const f = extendedFixture(), extra = f.ledger.cases[64];
            if (kind === 'missing-original') f.ledger.cases.shift();
            if (kind === 'duplicate-extra') f.ledger.cases[65].id = extra.id;
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
