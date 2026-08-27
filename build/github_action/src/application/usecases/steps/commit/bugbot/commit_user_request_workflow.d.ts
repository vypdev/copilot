import type { Result } from '../../../../../data/model/result';
import type { Execution } from '../../../../../data/model/execution';
import type { AuthenticatedUserPort } from '../../../../../application/ports/authenticated_user_ports';
import type { GitCommitPort } from '../../../../../application/ports/git_ports';
export declare function commitUserRequestIfSuccessful(param: Execution, branchOverride: string | undefined, results: Result[], authenticatedUserPort: AuthenticatedUserPort, gitCommitPort: GitCommitPort): Promise<void>;
