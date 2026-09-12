export interface ConfigurationPayloadContext {
    readonly currentConfiguration: {
        readonly branchType: string;
        readonly releaseBranch?: string;
        readonly workingBranch?: string;
        readonly parentBranch?: string;
        readonly hotfixOriginBranch?: string;
        readonly hotfixBranch?: string;
        readonly releaseOriginBranch?: string;
        readonly releaseOriginSha?: string;
        readonly hotfixOriginSha?: string;
        readonly deploymentOrchestration?: unknown;
        readonly branchConfiguration?: unknown;
        readonly recommendationState?: unknown;
    };
}

export interface ConfigurationPersistenceContext extends ConfigurationPayloadContext {
    readonly issueNumber: number;
}

export interface ConfigurationStorePort {
    update(context: ConfigurationPersistenceContext): Promise<string | undefined>;
}
