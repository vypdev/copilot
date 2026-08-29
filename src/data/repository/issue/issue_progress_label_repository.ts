import { logDebugInfo } from '../../../utils/logger';
import type { IssueLabelsPort } from '../../../application/ports/issue_management_ports';
import { PROGRESS_LABEL_PATTERN } from '../../../application/policies/progress_labels';

export class IssueProgressLabelRepository {
    constructor(private readonly issueLabelRepository: Pick<IssueLabelsPort, 'getLabels' | 'setLabels'>) {}

    setProgressLabel = async (
        owner: string,
        repository: string,
        issueNumber: number,
        progress: number,
        token: string,
    ): Promise<void> => {
        const rounded = Math.min(100, Math.max(0, Math.round(progress / 5) * 5));
        const newLabel = `${rounded}%`;
        const current = await this.issueLabelRepository.getLabels(owner, repository, issueNumber, token);
        const withoutProgress = current.filter(name => !PROGRESS_LABEL_PATTERN.test(name));
        const nextLabels = withoutProgress.includes(newLabel)
            ? withoutProgress
            : [...withoutProgress, newLabel];
        await this.issueLabelRepository.setLabels(owner, repository, issueNumber, nextLabels, token);
        logDebugInfo(`Progress label set to ${newLabel} for issue #${issueNumber}`);
    };
}
