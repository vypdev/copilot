import { applyCommitPrefixTransform } from './commit_prefix_transform_policy';

export function buildCommitPrefix(
    branchName: string,
    transforms: string,
    onUnknownTransform?: (transform: string) => void,
): string {
    return transforms
        .split(',')
        .map((transform) => transform.trim())
        .reduce((result, transform) => applyCommitPrefixTransform(result, transform, onUnknownTransform), branchName);
}
