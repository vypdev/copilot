import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type Report = { testResults: { name: string; assertionResults: { fullName: string; status: string }[] }[] };
type Ledger = { cases: { gate: string; evidence: { file: string; test: string }[] }[] };

const root = resolve(__dirname, '../../..');
const omitted = Symbol('omitted report');

describe('publisher acceptance report execution boundary', () => {
    let directory: string;
    let next = 0;
    beforeAll(() => { directory = mkdtempSync(join(tmpdir(), 'copilot-publisher-report-test-')); });
    afterAll(() => { rmSync(directory, { recursive: true, force: true }); });

    function run(report: unknown = omitted) {
        const args = [join(root, 'scripts/validate-setup-publisher-acceptance.cjs')];
        if (report !== omitted) {
            const file = join(directory, `report-${next++}.json`);
            const contents = JSON.stringify(report);
            if (contents === undefined) throw new Error('Invalid test fixture.');
            writeFileSync(file, contents);
            args.push(file);
        }
        const env = Object.fromEntries(Object.entries(process.env)
            .filter(([key]) => ['PATH', 'SystemRoot', 'WINDIR', 'TMPDIR', 'TEMP', 'TMP'].includes(key)));
        return spawnSync(process.execPath, args, { cwd: root, env, encoding: 'utf8' });
    }

    function syntheticCompleteReport(): Report {
        // A parser fixture only; this does not claim the mapped feature tests ran.
        const ledger = JSON.parse(readFileSync(join(root, 'specs/setup-publisher-installation-acceptance.json'), 'utf8')) as Ledger;
        const suites = new Map<string, Report['testResults'][number]>();
        for (const item of ledger.cases.filter(item => item.gate === 'jest')) {
            for (const evidence of item.evidence) {
                const name = join(root, evidence.file);
                const suite = suites.get(name) ?? { name, assertionResults: [] };
                suite.assertionResults.push({ fullName: evidence.test, status: 'passed' });
                suites.set(name, suite);
            }
        }
        return { testResults: [...suites.values()] };
    }

    it('keeps registration-only mode exclusive to an omitted report argument', () => {
        const result = run();
        expect(result.status).toBe(0);
        expect(result.stdout).toContain('64 cases registered; execution is not established');
        expect(result.stdout).not.toContain('60/60 mapped Jest cases passed');
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
        expect(result.stdout).toContain('60/60 mapped Jest cases passed');
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
