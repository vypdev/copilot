import { copySetupFiles, ensureGitHubDirs, hasValidSetupToken, compareSetupWorkflows } from '../utils/setup_files';
import type { SetupWorkspacePort, SetupWorkspaceResult, SetupWorkspaceSelection } from '../application/ports/setup_workspace_ports';

export class SetupWorkspaceAdapter implements SetupWorkspacePort {
    prepare(selection?: SetupWorkspaceSelection): SetupWorkspaceResult {
        const workspace = process.cwd();
        ensureGitHubDirs(workspace);
        if (!selection) return copySetupFiles(workspace);
        return copySetupFiles(workspace, undefined, selection?.features, {
            updateExistingWorkflows: selection?.updateExistingWorkflows,
            approvedWorkflowFiles: selection?.approvedWorkflowFiles,
        });
    }

    hasValidToken(tokenOverride?: string): boolean {
        return tokenOverride === undefined
            ? hasValidSetupToken(process.cwd())
            : hasValidSetupToken(process.cwd(), tokenOverride);
    }

    compareWorkflows(features?: Parameters<typeof compareSetupWorkflows>[1]): ReturnType<typeof compareSetupWorkflows> {
        return compareSetupWorkflows(process.cwd(), features);
    }
}
