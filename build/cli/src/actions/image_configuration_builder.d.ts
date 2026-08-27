import { DEFAULT_IMAGE_CONFIG } from '../utils/constants';
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
export declare function buildImageConfiguration(read: ImageConfigurationReader): ResolvedImageConfiguration;
export {};
