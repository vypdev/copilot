import { compareSetupWorkflows } from '../utils/setup_files';
import type { SetupWorkspacePort, SetupWorkspaceResult, SetupWorkspaceSelection } from '../application/ports/setup_workspace_ports';
export declare class SetupWorkspaceAdapter implements SetupWorkspacePort {
    prepare(selection?: SetupWorkspaceSelection): SetupWorkspaceResult;
    hasValidToken(tokenOverride?: string): boolean;
    compareWorkflows(features?: Parameters<typeof compareSetupWorkflows>[1]): ReturnType<typeof compareSetupWorkflows>;
}
