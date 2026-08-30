import type { Execution } from '../../../data/model/execution';
import { Result } from '../../../data/model/result';
import type { RepositoryTagPort } from '../../ports/repository_release_ports';
export declare function runCreateTag(param: Execution, taskId: string, repositoryTagPort: RepositoryTagPort): Promise<Result[]>;
