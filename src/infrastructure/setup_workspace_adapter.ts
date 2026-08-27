import { copySetupFiles, ensureGitHubDirs, hasValidSetupToken } from '../utils/setup_files';
import type { SetupWorkspacePort, SetupWorkspaceResult } from '../application/ports/setup_workspace_ports';

export class SetupWorkspaceAdapter implements SetupWorkspacePort {
    prepare(): SetupWorkspaceResult {
        const workspace = process.cwd();
        ensureGitHubDirs(workspace);
        return copySetupFiles(workspace);
    }

    hasValidToken(): boolean {
        return hasValidSetupToken(process.cwd());
    }
}
