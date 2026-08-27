import type { IssueDescriptionQueryPort } from '../../../application/ports/issue_description_ports';
import type { IssueLabelsPort, IssueProgressPort } from '../../../application/ports/issue_management_ports';
import type { IssueContentRepository } from './issue_content_repository';
import type { IssueLabelRepository } from './issue_label_repository';
import type { IssueProgressLabelRepository } from './issue_progress_label_repository';

export class IssueProgressTrackingRepository implements IssueDescriptionQueryPort, IssueLabelsPort, IssueProgressPort {
    constructor(
        private readonly contentRepository: IssueContentRepository,
        private readonly labelRepository: IssueLabelRepository,
        private readonly progressRepository: IssueProgressLabelRepository,
    ) {}

    getDescription = (...args: Parameters<IssueContentRepository['getDescription']>) => this.contentRepository.getDescription(...args);
    getLabels = (...args: Parameters<IssueLabelRepository['getLabels']>) => this.labelRepository.getLabels(...args);
    setLabels = (...args: Parameters<IssueLabelRepository['setLabels']>) => this.labelRepository.setLabels(...args);
    setProgressLabel = (...args: Parameters<IssueProgressLabelRepository['setProgressLabel']>) => this.progressRepository.setProgressLabel(...args);
}
