import { DEFAULT_COPILOT_LIFECYCLE_LABELS, type CopilotLifecycleLabels } from './copilot_lifecycle';
import { ISSUE_START_LABEL } from './issue_start_policy';

export interface NativeIssueCompletionFacts {
    readonly number: number;
    readonly state: 'open' | 'closed';
    readonly reason: 'completed' | 'not_planned' | 'reopened' | 'unknown';
    readonly labels: readonly string[];
}

export interface IssueCompletionLabelConfiguration {
    readonly lifecycle: Readonly<CopilotLifecycleLabels>;
    readonly protectedLabels: readonly string[];
}

export const ISSUE_COMPLETION_LABEL_LIMIT = 1_000;
export type IssueCompletionPlan =
    | { readonly kind: 'invalid'; readonly code: 'invalid-identity' | 'invalid-metadata' | 'invalid-configuration' }
    | { readonly kind: 'open' }
    | { readonly kind: 'closed'; readonly reason: NativeIssueCompletionFacts['reason']; readonly remove: readonly string[]; readonly add: readonly string[] };
const canonicalProgress = /^(?:0|[1-9][0-9]?|100)%$/u;
export const isIssueCompletionLabelName = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 100
    && Array.from(value).every(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127);
const labelsValid = (value: unknown): value is readonly string[] => Array.isArray(value) && value.length <= ISSUE_COMPLETION_LABEL_LIMIT
    && value.every(isIssueCompletionLabelName) && new Set(value.map(label => label.toLowerCase())).size === value.length;

/** Native closure owns completion; labels alone cannot produce a write plan. */
export function planIssueCompletion(facts: NativeIssueCompletionFacts, configuration: IssueCompletionLabelConfiguration): IssueCompletionPlan {
    if (!Number.isSafeInteger(facts?.number) || facts.number < 1) return Object.freeze({ kind: 'invalid', code: 'invalid-identity' });
    if (!['open', 'closed'].includes(facts.state) || !['completed', 'not_planned', 'reopened', 'unknown'].includes(facts.reason)
        || !labelsValid(facts.labels)) return Object.freeze({ kind: 'invalid', code: 'invalid-metadata' });
    const keys = Object.keys(DEFAULT_COPILOT_LIFECYCLE_LABELS) as (keyof typeof DEFAULT_COPILOT_LIFECYCLE_LABELS)[];
    if (!configuration?.lifecycle || !keys.every(key => isIssueCompletionLabelName(configuration.lifecycle[key]))
        || !labelsValid(configuration.protectedLabels)) return Object.freeze({ kind: 'invalid', code: 'invalid-configuration' });
    const managed = new Set([ISSUE_START_LABEL, ...keys.map(key => configuration.lifecycle[key])].map(name => name.toLowerCase()));
    if (configuration.protectedLabels.some(name => managed.has(name.toLowerCase()) || canonicalProgress.test(name))) {
        return Object.freeze({ kind: 'invalid', code: 'invalid-configuration' });
    }
    if (facts.state === 'open') return Object.freeze({ kind: 'open' });
    const completed = facts.reason === 'completed';
    return Object.freeze({ kind: 'closed', reason: facts.reason,
        remove: Object.freeze(facts.labels.filter(name => managed.has(name.toLowerCase()) || canonicalProgress.test(name) && (!completed || name !== '100%'))),
        add: Object.freeze(completed && !facts.labels.includes('100%') ? ['100%'] : []),
    });
}
