import type { ExecutionIssueSetupPort } from '../../../application/ports/execution_setup_ports';
import type { IssueContentRepository } from './issue_content_repository';
import type { IssueLabelRepository } from './issue_label_repository';
import type { IssueMetadataRepository } from './issue_metadata_repository';
/** Composes the issue capabilities required to initialize an Execution. */
export declare class ExecutionIssueSetupRepository implements ExecutionIssueSetupPort {
    private readonly metadataRepository;
    private readonly contentRepository;
    private readonly labelRepository;
    constructor(metadataRepository: IssueMetadataRepository, contentRepository: IssueContentRepository, labelRepository: IssueLabelRepository);
    isPullRequest: (...args: Parameters<IssueMetadataRepository["isPullRequest"]>) => Promise<boolean>;
    isIssue: (...args: Parameters<IssueMetadataRepository["isIssue"]>) => Promise<boolean>;
    getHeadBranch: (...args: Parameters<IssueMetadataRepository["getHeadBranch"]>) => Promise<string | undefined>;
    getLabels: (...args: Parameters<IssueLabelRepository["getLabels"]>) => Promise<string[]>;
    getDescription: (...args: Parameters<IssueContentRepository["getDescription"]>) => Promise<string | undefined>;
    updateDescription: (...args: Parameters<IssueContentRepository["updateDescription"]>) => Promise<void>;
}
