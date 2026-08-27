export interface SetupWorkspaceResult {
    copied: number;
    skipped: number;
}

export interface SetupWorkspacePort {
    prepare(): SetupWorkspaceResult;
    hasValidToken(): boolean;
}
