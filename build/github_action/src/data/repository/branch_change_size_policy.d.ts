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
export declare function classifyChangeSize(metrics: ChangeSizeMetrics, sizeThresholds: SizeThresholds, labels: Labels): SizeCategoryResult;
