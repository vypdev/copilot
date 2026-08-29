import type { IssueDescriptionQueryPort } from '../../../application/ports/issue_description_ports';
import type { IssueLabelsPort, IssueProgressPort } from '../../../application/ports/issue_management_ports';
export declare class IssueProgressTrackingRepository implements IssueDescriptionQueryPort, IssueLabelsPort, IssueProgressPort {
    private readonly contentRepository;
    private readonly labelRepository;
    private readonly progressRepository;
    constructor(contentRepository: Pick<IssueDescriptionQueryPort, 'getDescription'>, labelRepository: Pick<IssueLabelsPort, 'getLabels' | 'setLabels'>, progressRepository: Pick<IssueProgressPort, 'setProgressLabel'>);
    getDescription: (...args: Parameters<IssueDescriptionQueryPort["getDescription"]>) => Promise<string | undefined>;
    getLabels: (...args: Parameters<IssueLabelsPort["getLabels"]>) => Promise<string[]>;
    setLabels: (...args: Parameters<IssueLabelsPort["setLabels"]>) => Promise<void>;
    setProgressLabel: (...args: Parameters<IssueProgressPort["setProgressLabel"]>) => Promise<void>;
}
