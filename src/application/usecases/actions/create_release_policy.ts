import { INPUT_KEYS } from '../../../utils/constants';
import { ApplicationError } from '../../errors/application_error';

const SEMVER_PATTERN = /^\d+(\.\d+){0,2}$/;

export interface ReleaseInput {
    version: string;
    title: string;
    changelog: string;
}

export function validateReleaseInput(input: ReleaseInput): string | undefined {
    if (!input.version.length) return `${INPUT_KEYS.SINGLE_ACTION_VERSION} is not set.`;
    if (!input.title.length) return `${INPUT_KEYS.SINGLE_ACTION_TITLE} is not set.`;
    if (!input.changelog.length) return `${INPUT_KEYS.SINGLE_ACTION_CHANGELOG} is not set.`;
    const normalized = normalizeVersion(input.version);
    return normalized === undefined
        ? `${INPUT_KEYS.SINGLE_ACTION_VERSION} must be a semantic version (e.g. 1.0.0). Got: ${input.version}`
        : undefined;
}

export function normalizeVersion(version: string): string | undefined {
    const withoutV = version.trim().startsWith('v') ? version.trim().slice(1).trim() : version.trim();
    return withoutV.length > 0 && SEMVER_PATTERN.test(withoutV) ? withoutV : undefined;
}

export function versionForRelease(version: string): string {
    const normalized = normalizeVersion(version);
    if (normalized === undefined) throw new ApplicationError('Cannot build a release version from invalid input.', 'validation');
    return `v${normalized}`;
}
