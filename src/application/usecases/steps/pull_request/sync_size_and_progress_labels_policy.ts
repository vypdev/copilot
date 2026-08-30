import { PROGRESS_LABEL_PATTERN } from '../../../../application/policies/progress_labels';

export function selectSizeAndProgressLabels(labels: ReadonlyArray<string>, sizeLabels: ReadonlyArray<string>): string[] {
    return labels.filter((name) => sizeLabels.includes(name) || PROGRESS_LABEL_PATTERN.test(name));
}

export function mergeSizeAndProgressLabels(
    pullRequestLabels: ReadonlyArray<string>,
    issueLabels: ReadonlyArray<string>,
    sizeLabels: ReadonlyArray<string>,
): string[] {
    const existing = new Set(
        pullRequestLabels.filter((name) => !sizeLabels.includes(name) && !PROGRESS_LABEL_PATTERN.test(name)),
    );
    issueLabels.forEach((label) => existing.add(label));
    return [...existing];
}
