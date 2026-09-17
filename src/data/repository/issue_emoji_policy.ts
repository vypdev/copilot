import type { TitleLabelFacts } from '../../application/ports/issue_title_ports';

interface EmojiRule {
    emoji: string;
    matches: (labels: TitleLabelFacts) => boolean;
}

const TYPE_RULES: readonly EmojiRule[] = [
    { emoji: '🔥', matches: labels => labels.isHotfix },
    { emoji: '🚀', matches: labels => labels.isRelease },
    { emoji: '🐛', matches: labels => labels.isBugfix || labels.isBug },
    { emoji: '✨', matches: labels => labels.isFeature || labels.isEnhancement },
    { emoji: '📝', matches: labels => labels.isDocs || labels.isDocumentation },
    { emoji: '🔧', matches: labels => labels.isChore || labels.isMaintenance },
];

const CONTEXT_RULES: readonly EmojiRule[] = [
    ...TYPE_RULES,
    { emoji: '🆘', matches: labels => labels.isHelp },
    { emoji: '❓', matches: labels => labels.isQuestion },
];

export function resolveIssueTitleEmoji(labels: TitleLabelFacts, branchManagementEmoji: string): string {
    return resolveTitleEmoji(labels, branchManagementEmoji);
}

export function resolvePullRequestTitleEmoji(labels: TitleLabelFacts, branchManagementEmoji: string): string {
    return resolveTitleEmoji(labels, branchManagementEmoji);
}

function resolveTitleEmoji(labels: TitleLabelFacts, branchManagementEmoji: string): string {
    const typeEmoji = firstMatchingEmoji(TYPE_RULES, labels);
    if (typeEmoji && labels.containsBranchedLabel) return `${typeEmoji}${branchManagementEmoji}`;
    return typeEmoji ?? firstMatchingEmoji(CONTEXT_RULES.slice(TYPE_RULES.length), labels) ?? '🤖';
}

function firstMatchingEmoji(rules: readonly EmojiRule[], labels: TitleLabelFacts): string | undefined {
    return rules.find(rule => rule.matches(labels))?.emoji;
}
