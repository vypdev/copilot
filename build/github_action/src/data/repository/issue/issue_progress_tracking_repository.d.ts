import type { IssueDescriptionQueryPort } from '../../../application/ports/issue_description_ports';
import type { IssueLabelsPort, IssueProgressPort } from '../../../application/ports/issue_management_ports';
import type { IssueContentRepository } from './issue_content_repository';
import type { IssueLabelRepository } from './issue_label_repository';
import type { IssueProgressLabelRepository } from './issue_progress_label_repository';
export declare class IssueProgressTrackingRepository implements IssueDescriptionQueryPort, IssueLabelsPort, IssueProgressPort {
    private readonly contentRepository;
    private readonly labelRepository;
    private readonly progressRepository;
    constructor(contentRepository: IssueContentRepository, labelRepository: IssueLabelRepository, progressRepository: IssueProgressLabelRepository);
    getDescription: (...args: Parameters<IssueContentRepository["getDescription"]>) => Promise<string | undefined>;
    getLabels: (...args: Parameters<IssueLabelRepository["getLabels"]>) => Promise<string[]>;
    setLabels: (...args: Parameters<IssueLabelRepository["setLabels"]>) => Promise<void>;
    setProgressLabel: (...args: Parameters<IssueProgressLabelRepository["setProgressLabel"]>) => Promise<void>;
}
