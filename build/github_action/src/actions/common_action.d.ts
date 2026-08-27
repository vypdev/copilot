import { Execution } from '../data/model/execution';
import { Result } from '../data/model/result';
import { ProjectBoardCommandPort } from '../application/ports/project_board_command_ports';
import type { LatestTagQueryPort } from '../application/ports/branch_tag_ports';
export declare function mainRun(execution: Execution, projectBoardCommandPort: ProjectBoardCommandPort, latestTagQueryPort: LatestTagQueryPort): Promise<Result[]>;
