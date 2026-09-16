import { enabledSetupWorkflowFiles, isSetupWorkflowEnabled } from '../setup_workflow_catalog';

describe('setup workflow catalog', () => {
    it('keeps commit analysis and branch synchronization under one capability', () => {
        const files = enabledSetupWorkflowFiles({ commits: true });

        expect(files).toEqual(expect.arrayContaining(['copilot_commit.yml', 'copilot_branch_sync.yml']));
    });

    it('keeps PR analysis and merge-queue compatibility under one capability', () => {
        const files = enabledSetupWorkflowFiles({ pullRequests: true });

        expect(files).toEqual(expect.arrayContaining([
            'copilot_pull_request.yml',
            'copilot_pull_request_merge_queue.yml',
        ]));
        expect(isSetupWorkflowEnabled('copilot_pull_request_merge_queue.yml', { pullRequests: false })).toBe(false);
    });

    it('disables every workflow owned by a disabled capability', () => {
        expect(isSetupWorkflowEnabled('copilot_commit.yml', { commits: false })).toBe(false);
        expect(isSetupWorkflowEnabled('copilot_branch_sync.yml', { commits: false })).toBe(false);
    });

    it('keeps uncatalogued workflow files eligible for extension', () => {
        expect(isSetupWorkflowEnabled('custom.yml', { commits: false })).toBe(true);
        expect(isSetupWorkflowEnabled('custom.yml')).toBe(true);
    });
});
