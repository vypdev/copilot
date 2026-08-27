import type { Labels } from '../model/labels';
import type { SizeThresholds } from '../model/size_thresholds';

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
    sizeThresholds: SizeThresholds,
    labels: Labels,
): SizeCategoryResult {
    const categories = [
        { key: 'xxl' as const, label: labels.sizeXxl, githubSize: 'XL' },
        { key: 'xl' as const, label: labels.sizeXl, githubSize: 'XL' },
        { key: 'l' as const, label: labels.sizeL, githubSize: 'L' },
        { key: 'm' as const, label: labels.sizeM, githubSize: 'M' },
        { key: 's' as const, label: labels.sizeS, githubSize: 'S' },
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
        size: labels.sizeXs,
        githubSize: 'XS',
        reason: `Small changes (${metrics.totalChanges} lines, ${metrics.totalFiles} files)`,
    };
}
