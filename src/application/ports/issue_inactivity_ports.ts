import type { IssueActivitySnapshot } from '../../domain/issue_inactivity';

export interface IssueInactivityQueryPort {
    listOpenIssuesByLabel(
        owner: string,
        repository: string,
        label: string,
        token: string,
    ): Promise<readonly IssueActivitySnapshot[]>;
    getOpenIssue(
        owner: string,
        repository: string,
        issueNumber: number,
        token: string,
    ): Promise<IssueActivitySnapshot | undefined>;
}

export interface IssueInactivityClockPort {
    nowMilliseconds(): number;
}
