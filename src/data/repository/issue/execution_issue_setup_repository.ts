import type { ExecutionIssueSetupPort } from '../../../application/ports/execution_setup_ports';
import type { IssueContentRepository } from './issue_content_repository';
import type { IssueLabelRepository } from './issue_label_repository';
import type { IssueMetadataRepository } from './issue_metadata_repository';

/** Composes the issue capabilities required to initialize an Execution. */
export class ExecutionIssueSetupRepository implements ExecutionIssueSetupPort {
    constructor(
        private readonly metadataRepository: IssueMetadataRepository,
        private readonly contentRepository: IssueContentRepository,
        private readonly labelRepository: IssueLabelRepository,
    ) {}

    isPullRequest = (...args: Parameters<IssueMetadataRepository['isPullRequest']>) => this.metadataRepository.isPullRequest(...args);
    isIssue = (...args: Parameters<IssueMetadataRepository['isIssue']>) => this.metadataRepository.isIssue(...args);
    getHeadBranch = (...args: Parameters<IssueMetadataRepository['getHeadBranch']>) => this.metadataRepository.getHeadBranch(...args);
    getLabels = (...args: Parameters<IssueLabelRepository['getLabels']>) => this.labelRepository.getLabels(...args);
    getDescription = (...args: Parameters<IssueContentRepository['getDescription']>) => this.contentRepository.getDescription(...args);
    updateDescription = (...args: Parameters<IssueContentRepository['updateDescription']>) => this.contentRepository.updateDescription(...args);
}
