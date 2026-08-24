import { IssueLabelRepository } from './issue_label_repository';
export declare class IssueProgressLabelRepository {
    private readonly issueLabelRepository;
    constructor(issueLabelRepository: IssueLabelRepository);
    setProgressLabel: (owner: string, repository: string, issueNumber: number, progress: number, token: string) => Promise<void>;
}
