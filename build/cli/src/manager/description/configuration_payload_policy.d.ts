export interface ConfigurationPayloadContext {
    readonly currentConfiguration: {
        readonly branchType: string;
        readonly releaseBranch?: string;
        readonly workingBranch?: string;
        readonly parentBranch?: string;
        readonly hotfixOriginBranch?: string;
        readonly hotfixBranch?: string;
        readonly branchConfiguration?: unknown;
        readonly recommendationState?: unknown;
    };
}
export declare function buildConfigurationPayload(execution: ConfigurationPayloadContext, storedRaw: string | undefined): string;
