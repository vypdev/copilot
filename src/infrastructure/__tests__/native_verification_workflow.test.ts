import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
const { assertNativeVerificationWorkflow } = require('../../../scripts/validate-workflow-contract.cjs') as { assertNativeVerificationWorkflow(file: string, workflow: any): void };
const { MAX_REQUESTS, phaseSteps } = require('../../../scripts/generate-native-verification-workflows.cjs') as {MAX_REQUESTS: number; phaseSteps(action: string): any[]};

describe('native verification workflow contract', () => {
    it.each(['.github/workflows', 'setup/workflows'])('parses canonical native YAML and anchors from %s', directory => {
        for (const name of ['copilot_issue_comment.yml', 'copilot_pull_request_comment.yml']) {
            const file = path.join(process.cwd(), directory, name); const workflow = load(fs.readFileSync(file, 'utf8'));
            expect(() => assertNativeVerificationWorkflow(file, workflow)).not.toThrow();
        }
    });
    it('has exactly twenty native setup slots and one completion, with five-minute native timeouts', () => {
        const steps = phaseSteps('./'); expect(MAX_REQUESTS).toBe(20); expect(steps).toHaveLength(41);
        expect(steps.filter(step => step.uses === './.github/actions/copilot-verification-setup').every(step => step['timeout-minutes'] === 5)).toBe(true);
    });
    it.each(['timeout', 'env', 'condition', 'reference', 'request', 'outcome', 'finish', 'extra', 'remove', 'prepare'])('rejects a weakened %s contract', kind => {
        const file = path.join(process.cwd(), 'setup/workflows/copilot_issue_comment.yml'); const workflow = load(fs.readFileSync(file, 'utf8')) as any;
        const job = Object.values(workflow.jobs)[0] as any; const start = job.steps.findIndex((step: any) => step.id === 'copilot'); const steps = job.steps;
        if (kind === 'timeout') steps[start + 1]['timeout-minutes'] = 60;
        if (kind === 'env') steps[start + 1].env.OPENAI_API_KEY = '${{ secrets.OPENAI_API_KEY }}';
        if (kind === 'condition') steps[start + 1].if = '${{ always() }}';
        if (kind === 'reference') steps[start + 2].uses = 'vypdev/copilot@other';
        if (kind === 'request') steps[start + 2].env.COPILOT_NATIVE_REQUEST = 'stale';
        if (kind === 'outcome') steps[start + 2].env.COPILOT_NATIVE_OUTCOME = 'success';
        if (kind === 'finish') steps[steps.length - 1].if = '${{ success() }}';
        if (kind === 'extra') steps.push({run: 'echo bypass'});
        if (kind === 'remove') steps.splice(start + 1, 2);
        if (kind === 'prepare') delete steps[start].env.COPILOT_NATIVE_PHASE;
        expect(() => assertNativeVerificationWorkflow(file, workflow)).toThrow(/native/u);
    });
});
