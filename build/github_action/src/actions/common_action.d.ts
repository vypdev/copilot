import { Execution } from '../data/model/execution';
import { Result } from '../data/model/result';
import { ProjectBoardCommandPort } from '../application/ports/project_board_command_ports';
import type { LatestTagQueryPort } from '../application/ports/branch_tag_ports';
import type { SynchronizeLifecycleStateUseCase } from '../application/usecases/actions/synchronize_lifecycle_state_use_case';
export declare function mainRun(execution: Execution, projectBoardCommandPort: ProjectBoardCommandPort, latestTagQueryPort: LatestTagQueryPort, lifecycleStateUseCase?: SynchronizeLifecycleStateUseCase): Promise<Result[]>;
