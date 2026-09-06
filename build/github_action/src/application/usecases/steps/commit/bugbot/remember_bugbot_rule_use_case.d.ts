import type { Execution } from '../../../../../data/model/execution';
import { Result } from '../../../../../data/model/result';
import type { BugbotLearnedRuleCommandPort } from '../../../../ports/bugbot_rule_ports';
import type { ParamUseCase } from '../../../base/param_usecase';
export interface RememberBugbotRuleParam {
    readonly execution: Execution;
    readonly rule: string;
}
/** Stores an explicitly approved, repository-versioned Bugbot rule. */
export declare class RememberBugbotRuleUseCase implements ParamUseCase<RememberBugbotRuleParam, Result[]> {
    private readonly rules;
    readonly taskId = "RememberBugbotRuleUseCase";
    constructor(rules: BugbotLearnedRuleCommandPort);
    invoke(param: RememberBugbotRuleParam): Promise<Result[]>;
}
