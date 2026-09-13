import type { ChangeSizeLabels, ChangeSizeThresholds } from '../../application/ports/branch_change_ports';

export interface SizeCategoryResult {
    size: string;
    githubSize: string;
    reason: string;
}

export interface ChangeSizeMetrics {
    totalChanges: number;
    totalFiles: number;
    totalCommits: number;
}

export function classifyChangeSize(
    metrics: ChangeSizeMetrics,
    sizeThresholds: ChangeSizeThresholds,
    labels: ChangeSizeLabels,
): SizeCategoryResult {
    const categories = [
        { key: 'xxl' as const, label: labels.xxl, githubSize: 'XL' },
        { key: 'xl' as const, label: labels.xl, githubSize: 'XL' },
        { key: 'l' as const, label: labels.l, githubSize: 'L' },
        { key: 'm' as const, label: labels.m, githubSize: 'M' },
        { key: 's' as const, label: labels.s, githubSize: 'S' },
    ];

    for (const category of categories) {
        const threshold = sizeThresholds[category.key];
        if (metrics.totalChanges > threshold.lines) {
            return {
                size: category.label,
                githubSize: category.githubSize,
                reason: `More than ${threshold.lines} lines changed`,
            };
        }
        if (metrics.totalFiles > threshold.files) {
            return {
                size: category.label,
                githubSize: category.githubSize,
                reason: `More than ${threshold.files} files modified`,
            };
        }
        if (metrics.totalCommits > threshold.commits) {
            return {
                size: category.label,
                githubSize: category.githubSize,
                reason: `More than ${threshold.commits} commits`,
            };
        }
    }

    return {
        size: labels.xs,
        githubSize: 'XS',
        reason: `Small changes (${metrics.totalChanges} lines, ${metrics.totalFiles} files)`,
    };
}
