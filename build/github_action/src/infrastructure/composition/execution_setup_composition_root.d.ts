import { SetupExecutionUseCase } from '../../application/usecases/execution/setup_execution_use_case';
import type { LatestTagQueryPort } from '../../application/ports/branch_tag_ports';
export declare function createSetupExecutionUseCase(latestTagQueryPort: LatestTagQueryPort): SetupExecutionUseCase;
