import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
const { assertNativeVerificationWorkflow } = require('../../../scripts/validate-workflow-contract.cjs') as { assertNativeVerificationWorkflow(file: string, workflow: any): void };
const { MAX_REQUESTS, phaseSteps, RUNTIME, SELF_ACTION, runtimeWorkflow } = require('../../../scripts/generate-native-verification-workflows.cjs') as {
    MAX_REQUESTS: number; phaseSteps(action: string): any[]; RUNTIME: string; SELF_ACTION: string; runtimeWorkflow(): any;
};
const read = (directory: string, name: string): {file: string; workflow: any} => {
    const file = path.join(process.cwd(), directory, name);
    return { file, workflow: load(fs.readFileSync(file, 'utf8')) };
};

describe('encapsulated native verification workflow contract', () => {
    it.each(['.github/workflows', 'setup/workflows'].flatMap(directory => ['copilot_issue_comment.yml', 'copilot_pull_request_comment.yml'].map(name => [directory, name])))(
        'keeps %s/%s as one compact call without phase or credential environment leakage', (directory, name) => {
            const { file, workflow } = read(directory, name);
            expect(() => assertNativeVerificationWorkflow(file, workflow)).not.toThrow();
            expect(fs.readFileSync(file, 'utf8').split('\n').length).toBeLessThanOrEqual(35);
            const job = Object.values(workflow.jobs)[0] as any;
            expect(job.steps).toBeUndefined(); expect(job.env).toBeUndefined();
            expect(job.secrets.PAT).toBe('${{ secrets.PAT }}');
        });
    it.each(['.github/workflows', 'setup/workflows'].flatMap(directory => ['copilot_issue_comment.yml', 'copilot_pull_request_comment.yml'].map(name => [directory, name])))(
        'grants the Cursor secret only to selected providers in %s/%s', (directory, name) => {
            const { file, workflow } = read(directory, name);
            const job = Object.values(workflow.jobs)[0] as any;
            const gate = "${{ (vars.AGENT_PROVIDER == 'cursor' || vars.FINDINGS_PROVIDER == 'cursor' || vars.FIXER_PROVIDER == 'cursor' || vars.PLANNER_PROVIDER == 'cursor' || vars.REVIEWER_PROVIDER == 'cursor' || vars.TESTER_PROVIDER == 'cursor') && secrets.CURSOR_API_KEY || '' }}";
            expect(job.secrets.CURSOR_API_KEY).toBe(gate);
            expect(runtimeWorkflow().jobs.copilot.steps.find((step: any) => step.id === 'copilot').env.CURSOR_API_KEY).toBe(gate);
            job.secrets.CURSOR_API_KEY = '${{ secrets.CURSOR_API_KEY }}';
            expect(() => assertNativeVerificationWorkflow(file, workflow)).toThrow(/native/u);
        });
    it('parses the single central native workflow including shared input anchors', () => {
        const { file, workflow } = read('.github/workflows', RUNTIME);
        expect(workflow).toEqual(runtimeWorkflow());
        expect(() => assertNativeVerificationWorkflow(file, workflow)).not.toThrow();
    });
    it.each(['JDK_JAVA_OPTIONS', 'GRADLE_USER_HOME'].flatMap(key => ['missing', 'foreign'].map(kind => [key, kind])))(
        'rejects %s %s native profile binding', (key, kind) => {
            const { file, workflow } = read('.github/workflows', RUNTIME);
            const setup = workflow.jobs.copilot.steps.find((step: any) => step.id === 'verification_setup_1');
            if (kind === 'missing') delete setup.env[key];
            else setup.env[key] = '${{ env.UNREVIEWED_OPTIONS }}';
            expect(() => assertNativeVerificationWorkflow(file, workflow)).toThrow(/native/u);
        });
    it.each(['JDK_JAVA_OPTIONS', 'GRADLE_USER_HOME'])('rejects forwarding setup-only %s as a Node continuation control', key => {
        const { file, workflow } = read('.github/workflows', RUNTIME);
        const continuation = workflow.jobs.copilot.steps.find((step: any) => step.id === 'verification_continue_1');
        continuation.env[key] = 'foreign-options';
        expect(() => assertNativeVerificationWorkflow(file, workflow)).toThrow(/native/u);
    });
    it.each(['.github/workflows', 'setup/workflows'])('accepts a reviewed group route in %s without changing other boundaries', directory => {
        const { file, workflow } = read(directory, 'copilot_issue_comment.yml');
        const job = Object.values(workflow.jobs)[0] as any;
        job.with['runs-on'] = JSON.stringify({ group: 'trusted', labels: ['self-hosted', 'codex', 'Linux'] });
        expect(() => assertNativeVerificationWorkflow(file, workflow)).not.toThrow();
    });
    it('rejects source routing that loses its agent role', () => {
        const { file, workflow } = read('.github/workflows', 'copilot_issue_comment.yml');
        const job = Object.values(workflow.jobs)[0] as any;
        job.with['runs-on'] = JSON.stringify(['self-hosted', 'unrelated']);
        expect(() => assertNativeVerificationWorkflow(file, workflow)).toThrow('codex role');
    });
    it('retains twenty setup slots, five-minute native cancellation and a final cleanup', () => {
        const steps = phaseSteps(SELF_ACTION); expect(MAX_REQUESTS).toBe(20); expect(steps).toHaveLength(41);
        expect(steps.filter(step => step.uses === './.git/copilot-verification-setup').every(step => step['timeout-minutes'] === 5)).toBe(true);
        expect(steps.at(-1).env.COPILOT_NATIVE_PHASE).toBe('finish');
        expect(steps.at(-1).if).toContain('always()');
    });
    it('binds every phase to the called workflow commit without a second version or mutable checkout', () => {
        const workflow = runtimeWorkflow(); const phases = workflow.jobs.copilot.steps.filter((step: any) => step.uses === SELF_ACTION);
        expect(phases).toHaveLength(22);
        expect(phases.every((step: any) => step.with === phases[0].with)).toBe(true);
        expect(JSON.stringify(workflow)).not.toContain('vypdev/copilot@');
        expect(JSON.stringify(workflow)).not.toContain('COPILOT_NATIVE_RUNTIME_CACHE');
    });
    it('scopes provider credentials to the initial phase and keeps setup runtime-only', () => {
        const job = runtimeWorkflow().jobs.copilot;
        expect(JSON.stringify(job.env)).not.toContain('secrets.');
        const credentialSteps = job.steps.filter((step: any) => Object.values(step.env ?? {}).some(value => String(value).includes('secrets.')));
        expect(credentialSteps.map((step: any) => step.id)).toEqual(['copilot']);
        for (const step of job.steps.filter((step: any) => step.uses === './.git/copilot-verification-setup')) {
            expect(step.with).toBeUndefined();
            expect(Object.keys(step.env).sort()).toEqual(['HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PATH', 'JAVA_HOME', 'JDK_JAVA_OPTIONS', 'GRADLE_USER_HOME', 'TMP', 'TEMP', 'TMPDIR'].sort());
        }
    });
    it.each(['timeout', 'env', 'condition', 'reference', 'request', 'outcome', 'finish', 'extra', 'remove', 'prepare', 'initial-source', 'credential-scope'])(
        'rejects a weakened central %s contract', kind => {
            const { file, workflow } = read('.github/workflows', RUNTIME);
            const steps = workflow.jobs.copilot.steps; const start = steps.findIndex((step: any) => step.id === 'copilot');
            if (kind === 'timeout') steps[start + 1]['timeout-minutes'] = 60;
            if (kind === 'env') steps[start + 1].env.OPENAI_API_KEY = '${{ secrets.OPENAI_API_KEY }}';
            if (kind === 'condition') steps[start + 1].if = '${{ always() }}';
            if (kind === 'reference') steps[start + 2].uses = 'vypdev/copilot@other';
            if (kind === 'request') steps[start + 2].env.COPILOT_NATIVE_REQUEST = 'stale';
            if (kind === 'outcome') steps[start + 2].env.COPILOT_NATIVE_OUTCOME = 'success';
            if (kind === 'finish') steps.at(-1).if = '${{ success() }}';
            if (kind === 'extra') steps.push({ run: 'echo bypass' });
            if (kind === 'remove') steps.splice(start + 1, 2);
            if (kind === 'prepare') delete steps[start].env.COPILOT_NATIVE_PHASE;
            if (kind === 'initial-source') steps[start].uses = './';
            if (kind === 'credential-scope') workflow.jobs.copilot.env.OPENAI_API_KEY = '${{ secrets.OPENAI_API_KEY }}';
            expect(() => assertNativeVerificationWorkflow(file, workflow)).toThrow(/native/u);
        });
    it.each(['steps', 'env', 'permissions', 'secrets', 'reference', 'events', 'gate', 'runner'])(
        'rejects a caller that changes the %s boundary', kind => {
            const { file, workflow } = read('setup/workflows', 'copilot_pull_request_comment.yml'); const job = workflow.jobs['copilot-pull-requests'];
            if (kind === 'steps') job.steps = [{ run: 'true' }];
            if (kind === 'env') job.env = { OPENAI_API_KEY: '${{ secrets.OPENAI_API_KEY }}' };
            if (kind === 'permissions') job.permissions.actions = 'write';
            if (kind === 'secrets') job.secrets = 'inherit';
            if (kind === 'reference') job.uses = job.uses.replace('@v3', '@master');
            if (kind === 'events') workflow.on.pull_request_review_comment.types = ['created'];
            if (kind === 'gate') job.if = '${{ always() }}';
            if (kind === 'runner') job.with['runs-on'] = 'not-json';
            expect(() => assertNativeVerificationWorkflow(file, workflow)).toThrow(/native/u);
        });
});
