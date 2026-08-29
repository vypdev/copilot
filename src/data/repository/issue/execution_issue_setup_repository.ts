import type { ExecutionIssueSetupPort } from '../../../application/ports/execution_setup_ports';

/** Composes the issue capabilities required to initialize an Execution. */
export class ExecutionIssueSetupRepository implements ExecutionIssueSetupPort {
    constructor(
        private readonly metadataRepository: Pick<ExecutionIssueSetupPort, 'isPullRequest' | 'isIssue' | 'getHeadBranch'>,
        private readonly contentRepository: Pick<ExecutionIssueSetupPort, 'getDescription' | 'updateDescription'>,
        private readonly labelRepository: Pick<ExecutionIssueSetupPort, 'getLabels'>,
    ) {}

    isPullRequest = (...args: Parameters<ExecutionIssueSetupPort['isPullRequest']>) => this.metadataRepository.isPullRequest(...args);
    isIssue = (...args: Parameters<ExecutionIssueSetupPort['isIssue']>) => this.metadataRepository.isIssue(...args);
    getHeadBranch = (...args: Parameters<ExecutionIssueSetupPort['getHeadBranch']>) => this.metadataRepository.getHeadBranch(...args);
    getLabels = (...args: Parameters<ExecutionIssueSetupPort['getLabels']>) => this.labelRepository.getLabels(...args);
    getDescription = (...args: Parameters<ExecutionIssueSetupPort['getDescription']>) => this.contentRepository.getDescription(...args);
    updateDescription = (...args: Parameters<ExecutionIssueSetupPort['updateDescription']>) => this.contentRepository.updateDescription(...args);
}
