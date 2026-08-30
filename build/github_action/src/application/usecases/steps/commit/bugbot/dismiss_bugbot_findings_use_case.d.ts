import type { Execution } from '../../../../../data/model/execution';
import { Result } from '../../../../../data/model/result';
import type { BugbotContextPorts } from '../../../../../application/ports/bugbot_context_ports';
import type { BugbotFindingResolutionPorts } from '../../../../../application/ports/bugbot_finding_resolution_ports';
export interface DismissBugbotFindingsParam {
    execution: Execution;
    findingIds: readonly string[];
}
export interface DismissBugbotFindingsDependencies {
    contextPorts: BugbotContextPorts;
    resolutionPorts: BugbotFindingResolutionPorts;
}
/** Dismisses only findings present in the current persisted Bugbot context. */
export declare class DismissBugbotFindingsUseCase {
    private readonly dependencies;
    readonly taskId = "DismissBugbotFindingsUseCase";
    constructor(dependencies: DismissBugbotFindingsDependencies);
    invoke(param: DismissBugbotFindingsParam): Promise<Result[]>;
}
