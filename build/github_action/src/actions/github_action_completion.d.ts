import type { Execution } from '../data/model/execution';
import type { Result } from '../data/model/result';
import type { ConfigurationStorePort } from '../application/ports/configuration_store_ports';
import { PublishResultUseCase } from '../application/usecases/steps/common/publish_resume_use_case';
export declare function finishGithubAction(execution: Execution, results: Result[], issueNotificationPort: ConstructorParameters<typeof PublishResultUseCase>[0], configurationStorePort: ConfigurationStorePort): Promise<void>;
