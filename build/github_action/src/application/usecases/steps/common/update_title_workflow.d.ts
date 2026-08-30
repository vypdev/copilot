import type { Execution } from '../../../../data/model/execution';
import { Result } from '../../../../data/model/result';
import type { IssueTitlePort } from '../../../../application/ports/issue_title_ports';
export declare function runIssueTitleUpdate(param: Execution, taskId: string, issueRepository: IssueTitlePort): Promise<Result[]>;
export declare function runPullRequestTitleUpdate(param: Execution, taskId: string, issueRepository: IssueTitlePort): Promise<Result[]>;
export declare function titleUpdateFailure(taskId: string, error: unknown): Result;
