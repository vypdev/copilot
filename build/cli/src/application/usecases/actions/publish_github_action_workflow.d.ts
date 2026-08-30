import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { RepositoryReleasePublicationPort, RepositoryTagPort } from '../../ports/repository_release_ports';
export declare function runPublishGithubAction(param: Execution, taskId: string, repositoryTagPort: RepositoryTagPort, repositoryReleasePort: RepositoryReleasePublicationPort): Promise<Result[]>;
