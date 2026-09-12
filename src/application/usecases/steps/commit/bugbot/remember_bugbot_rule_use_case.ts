import type { Execution } from '../../../../../data/model/execution';
import { Result } from '../../../../../data/model/result';
import type { BugbotLearnedRuleCommandPort } from '../../../../ports/bugbot_rule_ports';
import type { ParamUseCase } from '../../../base/param_usecase';
import { toApplicationError } from '../../../../errors/application_error';

export interface RememberBugbotRuleParam {
    readonly execution: Execution;
    readonly rule: string;
}

/** Stores an explicitly approved, repository-versioned Bugbot rule. */
export class RememberBugbotRuleUseCase implements ParamUseCase<RememberBugbotRuleParam, Result[]> {
    readonly taskId = 'RememberBugbotRuleUseCase';

    constructor(private readonly rules: BugbotLearnedRuleCommandPort) {}

    async invoke(param: RememberBugbotRuleParam): Promise<Result[]> {
        try {
            const state = await this.rules.rememberRule(param.rule);
            return [new Result({
                id: this.taskId,
                success: true,
                executed: state === 'created',
                steps: [state === 'created'
                    ? 'Learned Bugbot rule added to .copilot/BUGBOT.learned.md.'
                    : 'That learned Bugbot rule already exists; no repository change was needed.'],
                payload: { learnedRule: state },
            })];
        } catch (error) {
            return [new Result({
                id: this.taskId,
                success: false,
                executed: false,
                errors: [toApplicationError(error, 'provider.unavailable', 'Unable to remember the Bugbot rule.')],
            })];
        }
    }
}
