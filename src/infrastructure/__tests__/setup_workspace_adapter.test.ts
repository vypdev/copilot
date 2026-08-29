const ensureGitHubDirs = jest.fn();
const copySetupFiles = jest.fn();
const hasValidSetupToken = jest.fn();

jest.mock('../../utils/setup_files', () => ({
    ensureGitHubDirs,
    copySetupFiles,
    hasValidSetupToken,
}));

import { SetupWorkspaceAdapter } from '../setup_workspace_adapter';

describe('SetupWorkspaceAdapter', () => {
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
        const adapter = new SetupWorkspaceAdapter();

        expect(adapter.prepare()).toBe(result);
        expect(ensureGitHubDirs).toHaveBeenCalledWith('/workspace');
        expect(copySetupFiles).toHaveBeenCalledWith('/workspace');
    });

    it('delegates token validation to the setup file boundary', () => {
        hasValidSetupToken.mockReturnValue(true);

        expect(new SetupWorkspaceAdapter().hasValidToken()).toBe(true);
        expect(hasValidSetupToken).toHaveBeenCalledWith('/workspace');
    });
});
