import type { SetupWorkspacePort, SetupWorkspaceResult } from '../application/ports/setup_workspace_ports';
export declare class SetupWorkspaceAdapter implements SetupWorkspacePort {
    prepare(): SetupWorkspaceResult;
    hasValidToken(): boolean;
}
