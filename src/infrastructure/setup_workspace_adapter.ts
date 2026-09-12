import { copySetupFiles, ensureGitHubDirs, hasValidSetupToken, compareSetupWorkflows } from '../utils/setup_files';
import type {
    SetupDoctorWorkspaceQueryPort,
    SetupWorkspacePort,
    SetupWorkspaceResult,
    SetupWorkspaceSelection,
} from '../application/ports/setup_workspace_ports';
import { isGitRepositoryRoot } from '../cli_context';

export class SetupWorkspaceMutationAdapter implements SetupWorkspacePort {
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

}

export class SetupDoctorWorkspaceQueryAdapter implements SetupDoctorWorkspaceQueryPort {
    isRepositoryRoot(): boolean {
        return isGitRepositoryRoot(process.cwd());
    }

    compareWorkflows(features?: Parameters<typeof compareSetupWorkflows>[1]): ReturnType<typeof compareSetupWorkflows> {
        return compareSetupWorkflows(process.cwd(), features);
    }
}

/** Reconcile intentionally combines local comparison and approved local writes. */
export class SetupReconcileWorkspaceAdapter implements SetupWorkspacePort, SetupDoctorWorkspaceQueryPort {
    private readonly mutation = new SetupWorkspaceMutationAdapter();
    private readonly query = new SetupDoctorWorkspaceQueryAdapter();

    prepare(selection?: SetupWorkspaceSelection): SetupWorkspaceResult {
        return this.mutation.prepare(selection);
    }

    hasValidToken(tokenOverride?: string): boolean {
        return this.mutation.hasValidToken(tokenOverride);
    }

    isRepositoryRoot(): boolean {
        return this.query.isRepositoryRoot();
    }

    compareWorkflows(features?: Parameters<typeof compareSetupWorkflows>[1]): ReturnType<typeof compareSetupWorkflows> {
        return this.query.compareWorkflows(features);
    }
}
