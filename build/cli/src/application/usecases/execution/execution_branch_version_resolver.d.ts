import type { LatestTagQueryPort } from '../../ports/branch_tag_ports';
import type { Execution } from '../../../data/model/execution';
import { type Result } from '../../../data/model/result';
import type { ParamUseCase } from '../base/param_usecase';
export interface ExecutionBranchVersionResolution {
    resolve(execution: Execution): Promise<boolean>;
}
export declare class ExecutionBranchVersionResolver implements ExecutionBranchVersionResolution {
    private readonly latestTagQueryPort;
    private readonly getReleaseVersion;
    private readonly getReleaseType;
    private readonly getHotfixVersion;
    constructor(latestTagQueryPort: LatestTagQueryPort, getReleaseVersion: ParamUseCase<Execution, Result[]>, getReleaseType: ParamUseCase<Execution, Result[]>, getHotfixVersion: ParamUseCase<Execution, Result[]>);
    resolve(execution: Execution): Promise<boolean>;
    private resolveRelease;
    private resolveHotfix;
}
