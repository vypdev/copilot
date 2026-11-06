const PROFILES = Object.freeze({
    h2: Object.freeze({ kind: 'h2', appName: 'CopilotH2', identifier: 'invalid.extensions.copilot.h2', folder: 'safari-h2' }),
    h3: Object.freeze({ kind: 'h3', appName: 'CopilotH3', identifier: 'invalid.extensions.copilot.h3', folder: 'safari-h3' }),
} as const);
export type SafariContainerKind = keyof typeof PROFILES;
/** Local tooling variation is closed; callers cannot choose arbitrary names or output roots. */
export function safariContainerProfile(value: unknown = 'h2') {
    if (value !== 'h2' && value !== 'h3') throw new Error('prerequisite:safari-container-profile');
    return PROFILES[value];
}
