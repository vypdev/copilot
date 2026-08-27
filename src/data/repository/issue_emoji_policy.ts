import type { Labels } from '../model/labels';

export function resolveIssueTitleEmoji(labels: Labels, branchManagementAlways: boolean, branchManagementEmoji: string): string {
    const branched = branchManagementAlways || labels.containsBranchedLabel;
    if (labels.isHotfix && branched) return `🔥${branchManagementEmoji}`;
    if (labels.isRelease && branched) return `🚀${branchManagementEmoji}`;
    if ((labels.isBugfix || labels.isBug) && branched) return `🐛${branchManagementEmoji}`;
    if ((labels.isFeature || labels.isEnhancement) && branched) return `✨${branchManagementEmoji}`;
    if ((labels.isDocs || labels.isDocumentation) && branched) return `📝${branchManagementEmoji}`;
    if ((labels.isChore || labels.isMaintenance) && branched) return `🔧${branchManagementEmoji}`;
    if (labels.isHotfix) return '🔥';
    if (labels.isRelease) return '🚀';
    if (labels.isDocs || labels.isDocumentation) return '📝';
    if (labels.isChore || labels.isMaintenance) return '🔧';
    if (labels.isBugfix || labels.isBug) return '🐛';
    if (labels.isFeature || labels.isEnhancement) return '✨';
    if (labels.isHelp) return '🆘';
    if (labels.isQuestion) return '❓';
    return '🤖';
}

export function resolvePullRequestTitleEmoji(labels: Labels, branchManagementAlways: boolean, branchManagementEmoji: string): string {
    const branched = branchManagementAlways || labels.containsBranchedLabel;
    if (labels.isHotfix && branched) return `🔥${branchManagementEmoji}`;
    if (labels.isRelease && branched) return `🚀${branchManagementEmoji}`;
    if ((labels.isBugfix || labels.isBug) && branched) return `🐛${branchManagementEmoji}`;
    if ((labels.isFeature || labels.isEnhancement) && branched) return `✨${branchManagementEmoji}`;
    if ((labels.isDocs || labels.isDocumentation) && branched) return `📝${branchManagementEmoji}`;
    if ((labels.isChore || labels.isMaintenance) && branched) return `🔧${branchManagementEmoji}`;
    if (labels.isHotfix) return '🔥';
    if (labels.isRelease) return '🚀';
    if (labels.isBugfix || labels.isBug) return '🐛';
    if (labels.isFeature || labels.isEnhancement) return '✨';
    if (labels.isDocs || labels.isDocumentation) return '📝';
    if (labels.isChore || labels.isMaintenance) return '🔧';
    if (labels.isHelp) return '🆘';
    if (labels.isQuestion) return '❓';
    return '🤖';
}
