import { Execution } from '../data/model/execution';
import { Result } from '../data/model/result';
import { ProjectBoardCommandPort } from '../application/ports/project_board_command_ports';
import type { LatestTagQueryPort } from '../application/ports/branch_tag_ports';
import type { SynchronizeLifecycleStateUseCase } from '../application/usecases/actions/synchronize_lifecycle_state_use_case';
import type { SynchronizeAgentActivityUseCase } from '../application/usecases/actions/synchronize_agent_activity_use_case';
export declare function mainRun(execution: Execution, projectBoardCommandPort: ProjectBoardCommandPort, latestTagQueryPort: LatestTagQueryPort, lifecycleStateUseCase?: SynchronizeLifecycleStateUseCase, agentActivityUseCase?: SynchronizeAgentActivityUseCase): Promise<Result[]>;
