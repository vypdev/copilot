import { existsSync } from 'node:fs';
import { join } from 'node:path';

describe('Octokit adapter boundaries', () => {
    const githubDirectory = join(__dirname, '..');

    it('does not retain the universal Octokit adapter module', () => {
        expect(existsSync(join(githubDirectory, 'octokit_client.ts'))).toBe(false);
    });

    it('keeps adapters grouped by provider capability', () => {
        for (const file of [
            'octokit_identity_adapters.ts',
            'octokit_branch_adapters.ts',
            'octokit_issue_adapters.ts',
            'octokit_pull_request_adapters.ts',
            'octokit_project_adapters.ts',
            'octokit_release_adapters.ts',
            'octokit_workflow_adapters.ts',
        ]) {
            expect(existsSync(join(githubDirectory, file))).toBe(true);
        }
    });
});
