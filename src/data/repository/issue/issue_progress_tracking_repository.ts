import type { IssueDescriptionQueryPort } from '../../../application/ports/issue_description_ports';
import type { IssueLabelsPort, IssueProgressPort } from '../../../application/ports/issue_management_ports';

export class IssueProgressTrackingRepository implements IssueDescriptionQueryPort, IssueLabelsPort, IssueProgressPort {
    constructor(
        private readonly contentRepository: Pick<IssueDescriptionQueryPort, 'getDescription'>,
        private readonly labelRepository: Pick<IssueLabelsPort, 'getLabels' | 'setLabels'>,
        private readonly progressRepository: Pick<IssueProgressPort, 'setProgressLabel'>,
    ) {}

    getDescription = (...args: Parameters<IssueDescriptionQueryPort['getDescription']>) => this.contentRepository.getDescription(...args);
    getLabels = (...args: Parameters<IssueLabelsPort['getLabels']>) => this.labelRepository.getLabels(...args);
    setLabels = (...args: Parameters<IssueLabelsPort['setLabels']>) => this.labelRepository.setLabels(...args);
    setProgressLabel = (...args: Parameters<IssueProgressPort['setProgressLabel']>) => this.progressRepository.setProgressLabel(...args);
}
