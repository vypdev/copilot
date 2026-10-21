import { readFileSync } from 'node:fs';
import path from 'node:path';
import yaml from 'js-yaml';

describe('shipped verification runtime guidance', () => {
    it('keeps runtime bootstrap operator-owned in every command and automated-fix template', () => {
        for (const name of ['copilot_commit', 'copilot_issue', 'copilot_issue_comment', 'copilot_pull_request', 'copilot_pull_request_comment', 'copilot_pull_request_review_state']) {
            const content = readFileSync(path.resolve('setup/workflows', `${name}.yml`), 'utf8');
            expect(content).toContain('.copilot/verification-prerequisites.json');
            expect(content).toContain('#repository-verification-prerequisites');
            const workflow = yaml.load(content) as { jobs: Record<string, { uses?: string; steps?: Array<{ uses?: string }> }> };
            const actions = Object.values(workflow.jobs).flatMap(job => [job.uses, ...(job.steps ?? []).map(step => step.uses)]);
            expect(actions).not.toContain('actions/setup-java@v5');
            expect(actions).toContain(name.endsWith('_comment')
                ? 'vypdev/copilot/.github/workflows/copilot_comment_runtime.yml@v3'
                : 'vypdev/copilot@v3');
        }
    });
});
