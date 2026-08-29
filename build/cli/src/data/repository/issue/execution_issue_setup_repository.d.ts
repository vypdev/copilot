import type { ExecutionIssueSetupPort } from '../../../application/ports/execution_setup_ports';
/** Composes the issue capabilities required to initialize an Execution. */
export declare class ExecutionIssueSetupRepository implements ExecutionIssueSetupPort {
    private readonly metadataRepository;
    private readonly contentRepository;
    private readonly labelRepository;
    constructor(metadataRepository: Pick<ExecutionIssueSetupPort, 'isPullRequest' | 'isIssue' | 'getHeadBranch'>, contentRepository: Pick<ExecutionIssueSetupPort, 'getDescription' | 'updateDescription'>, labelRepository: Pick<ExecutionIssueSetupPort, 'getLabels'>);
    isPullRequest: (...args: Parameters<ExecutionIssueSetupPort["isPullRequest"]>) => Promise<boolean>;
    isIssue: (...args: Parameters<ExecutionIssueSetupPort["isIssue"]>) => Promise<boolean>;
    getHeadBranch: (...args: Parameters<ExecutionIssueSetupPort["getHeadBranch"]>) => Promise<string | undefined>;
    getLabels: (...args: Parameters<ExecutionIssueSetupPort["getLabels"]>) => Promise<string[]>;
    getDescription: (...args: Parameters<ExecutionIssueSetupPort["getDescription"]>) => Promise<string | undefined>;
    updateDescription: (...args: Parameters<ExecutionIssueSetupPort["updateDescription"]>) => Promise<void>;
}
