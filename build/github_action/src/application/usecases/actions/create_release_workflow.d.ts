import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { RepositoryReleasePublicationPort } from '../../ports/repository_release_ports';
export declare function runCreateRelease(param: Execution, taskId: string, repositoryReleasePort: RepositoryReleasePublicationPort): Promise<Result[]>;
