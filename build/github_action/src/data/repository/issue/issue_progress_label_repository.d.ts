import type { IssueLabelsPort } from '../../../application/ports/issue_management_ports';
export declare class IssueProgressLabelRepository {
    private readonly issueLabelRepository;
    constructor(issueLabelRepository: Pick<IssueLabelsPort, 'getLabels' | 'setLabels'>);
    setProgressLabel: (owner: string, repository: string, issueNumber: number, progress: number, token: string) => Promise<void>;
}
