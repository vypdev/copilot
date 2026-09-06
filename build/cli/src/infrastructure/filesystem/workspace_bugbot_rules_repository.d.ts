import type { BugbotLearnedRuleCommandPort, BugbotReviewRule, BugbotRuleFileQueryPort } from '../../application/ports/bugbot_rule_ports';
export declare class WorkspaceBugbotRulesRepository implements BugbotRuleFileQueryPort, BugbotLearnedRuleCommandPort {
    private readonly root;
    constructor(root?: string);
    loadRules(changedFiles: readonly string[]): Promise<readonly BugbotReviewRule[]>;
    rememberRule(rule: string): Promise<'created' | 'existing'>;
}
