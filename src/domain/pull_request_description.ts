export const PULL_REQUEST_DESCRIPTION_MODES = [
    'replace',
    'append',
    'preserve',
    'disabled',
] as const;

export type PullRequestDescriptionMode = typeof PULL_REQUEST_DESCRIPTION_MODES[number];

export const DEFAULT_PULL_REQUEST_DESCRIPTION_MODE: PullRequestDescriptionMode = 'replace';

export const MANAGED_PULL_REQUEST_DESCRIPTION_START = '<!-- copilot:managed-pr-description -->';
export const MANAGED_PULL_REQUEST_DESCRIPTION_END = '<!-- /copilot:managed-pr-description -->';

/** Normalizes public configuration while keeping invalid values safe and backwards compatible. */
export function normalizePullRequestDescriptionMode(value: unknown): PullRequestDescriptionMode {
    const normalized = String(value ?? '').trim().toLowerCase();
    return PULL_REQUEST_DESCRIPTION_MODES.includes(normalized as PullRequestDescriptionMode)
        ? normalized as PullRequestDescriptionMode
        : DEFAULT_PULL_REQUEST_DESCRIPTION_MODE;
}

export function hasManagedPullRequestDescription(body: unknown): boolean {
    return typeof body === 'string' && body.includes(MANAGED_PULL_REQUEST_DESCRIPTION_START);
}

/** Renders one bounded Copilot-owned section without taking ownership of the rest of the body. */
export function renderManagedPullRequestDescription(generated: string): string {
    return [
        MANAGED_PULL_REQUEST_DESCRIPTION_START,
        generated.trim(),
        MANAGED_PULL_REQUEST_DESCRIPTION_END,
    ].join('\n');
}

/** Replaces the existing managed section, or appends one when none exists. */
export function mergeManagedPullRequestDescription(currentBody: unknown, generated: string): string {
    const current = typeof currentBody === 'string' ? currentBody.trim() : '';
    const managed = renderManagedPullRequestDescription(generated);
    const start = current.indexOf(MANAGED_PULL_REQUEST_DESCRIPTION_START);
    const end = current.indexOf(MANAGED_PULL_REQUEST_DESCRIPTION_END, start + MANAGED_PULL_REQUEST_DESCRIPTION_START.length);

    if (start >= 0 && end >= start) {
        const before = current.slice(0, start).trimEnd();
        const after = current.slice(end + MANAGED_PULL_REQUEST_DESCRIPTION_END.length).trimStart();
        return [before, managed, after].filter(Boolean).join('\n\n').trim();
    }

    return current ? `${current}\n\n${managed}` : managed;
}

export function shouldAutomaticallyUpdatePullRequestDescription(mode: PullRequestDescriptionMode): boolean {
    return mode === 'replace' || mode === 'append';
}
