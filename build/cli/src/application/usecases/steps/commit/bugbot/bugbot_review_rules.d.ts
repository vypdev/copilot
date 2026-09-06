import type { BugbotReviewRule } from '../../../../ports/bugbot_rule_ports';
export declare const MAX_BUGBOT_RULE_LENGTH = 30000;
export declare const MAX_BUGBOT_RULES_LENGTH = 100000;
export interface BugbotReviewRuleSet {
    readonly rules: readonly BugbotReviewRule[];
    readonly sources: readonly string[];
    readonly promptBlock: string;
    readonly omitted: number;
}
export declare function buildBugbotReviewRuleSet(organizationRules: readonly string[], repositoryRules: readonly BugbotReviewRule[]): BugbotReviewRuleSet;
