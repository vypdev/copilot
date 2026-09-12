const ensureGitHubDirs = jest.fn();
const copySetupFiles = jest.fn();
const hasValidSetupToken = jest.fn();

jest.mock('../../utils/setup_files', () => ({
    ensureGitHubDirs,
    copySetupFiles,
    hasValidSetupToken,
}));

import { SetupWorkspaceMutationAdapter } from '../setup_workspace_adapter';

describe('SetupWorkspaceMutationAdapter', () => {
    const originalCwd = process.cwd;

    beforeEach(() => {
        jest.clearAllMocks();
        process.cwd = jest.fn(() => '/workspace') as typeof process.cwd;
    });

    afterEach(() => {
        process.cwd = originalCwd;
    });

    it('prepares the current workspace through the setup file port', () => {
        const result = { copied: ['action.yml'], skipped: [] };
        copySetupFiles.mockReturnValue(result);
        const adapter = new SetupWorkspaceMutationAdapter();

        expect(adapter.prepare()).toBe(result);
        expect(ensureGitHubDirs).toHaveBeenCalledWith('/workspace');
        expect(copySetupFiles).toHaveBeenCalledWith('/workspace');
    });

    it('delegates token validation to the setup file boundary', () => {
        hasValidSetupToken.mockReturnValue(true);

        expect(new SetupWorkspaceMutationAdapter().hasValidToken()).toBe(true);
        expect(hasValidSetupToken).toHaveBeenCalledWith('/workspace');
    });
});
