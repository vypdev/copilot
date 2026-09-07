export type BugbotRuleScope = 'organization' | 'repository' | 'path' | 'learned';

export interface BugbotReviewRule {
    readonly source: string;
    readonly scope: BugbotRuleScope;
    readonly content: string;
}

export interface BugbotRuleFileQueryPort {
    loadRules(changedFiles: readonly string[]): Promise<readonly BugbotReviewRule[]>;
}

export interface BugbotLearnedRuleCommandPort {
    rememberRule(rule: string): Promise<'created' | 'existing'>;
}
