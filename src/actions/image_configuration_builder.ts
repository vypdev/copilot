import { DEFAULT_IMAGE_CONFIG, INPUT_KEYS } from '../utils/constants';
import { isEnabledInput } from './input_boolean_policy';
import { parseDelimitedValues } from './input_values_policy';

export type ImageConfigurationReader = (key: string) => unknown;

type ImageGroup = keyof typeof DEFAULT_IMAGE_CONFIG;
type ImageVariant = keyof (typeof DEFAULT_IMAGE_CONFIG)[ImageGroup];

export interface ResolvedImageConfiguration {
    onIssue: boolean;
    onPullRequest: boolean;
    onCommit: boolean;
    issue: Record<ImageVariant, string[]>;
    pullRequest: Record<ImageVariant, string[]>;
    commit: Record<ImageVariant, string[]>;
}

const imageInputKeys: Record<ImageGroup, Record<ImageVariant, string>> = {
    issue: {
        automatic: INPUT_KEYS.IMAGES_ISSUE_AUTOMATIC,
        feature: INPUT_KEYS.IMAGES_ISSUE_FEATURE,
        bugfix: INPUT_KEYS.IMAGES_ISSUE_BUGFIX,
        release: INPUT_KEYS.IMAGES_ISSUE_RELEASE,
        hotfix: INPUT_KEYS.IMAGES_ISSUE_HOTFIX,
        docs: INPUT_KEYS.IMAGES_ISSUE_DOCS,
        chore: INPUT_KEYS.IMAGES_ISSUE_CHORE,
    },
    pullRequest: {
        automatic: INPUT_KEYS.IMAGES_PULL_REQUEST_AUTOMATIC,
        feature: INPUT_KEYS.IMAGES_PULL_REQUEST_FEATURE,
        bugfix: INPUT_KEYS.IMAGES_PULL_REQUEST_BUGFIX,
        release: INPUT_KEYS.IMAGES_PULL_REQUEST_RELEASE,
        hotfix: INPUT_KEYS.IMAGES_PULL_REQUEST_HOTFIX,
        docs: INPUT_KEYS.IMAGES_PULL_REQUEST_DOCS,
        chore: INPUT_KEYS.IMAGES_PULL_REQUEST_CHORE,
    },
    commit: {
        automatic: INPUT_KEYS.IMAGES_COMMIT_AUTOMATIC,
        feature: INPUT_KEYS.IMAGES_COMMIT_FEATURE,
        bugfix: INPUT_KEYS.IMAGES_COMMIT_BUGFIX,
        release: INPUT_KEYS.IMAGES_COMMIT_RELEASE,
        hotfix: INPUT_KEYS.IMAGES_COMMIT_HOTFIX,
        docs: INPUT_KEYS.IMAGES_COMMIT_DOCS,
        chore: INPUT_KEYS.IMAGES_COMMIT_CHORE,
    },
};

export function buildImageConfiguration(
    read: ImageConfigurationReader,
): ResolvedImageConfiguration {
    const groups = {} as Pick<ResolvedImageConfiguration, ImageGroup>;

    for (const group of Object.keys(imageInputKeys) as ImageGroup[]) {
        const variants = {} as Record<ImageVariant, string[]>;
        for (const variant of Object.keys(imageInputKeys[group]) as ImageVariant[]) {
            const configured = parseDelimitedValues(read(imageInputKeys[group][variant]));
            variants[variant] = configured.length > 0
                ? configured
                : [...DEFAULT_IMAGE_CONFIG[group][variant]];
        }
        groups[group] = variants;
    }

    return {
        onIssue: isEnabledInput(read(INPUT_KEYS.IMAGES_ON_ISSUE)),
        onPullRequest: isEnabledInput(read(INPUT_KEYS.IMAGES_ON_PULL_REQUEST)),
        onCommit: isEnabledInput(read(INPUT_KEYS.IMAGES_ON_COMMIT)),
        ...groups,
    };
}
