export const TARGETS = ['chrome', 'firefox', 'safari'] as const;
export type BrowserTarget = typeof TARGETS[number];

export const TARGET_POLICY = {
    chrome: { syntax: 'chrome140', floor: '140', backgroundFormat: 'es' },
    firefox: { syntax: 'firefox140', floor: '140.0', backgroundFormat: 'iife' },
    safari: { syntax: 'safari18.2', floor: '18.2', backgroundFormat: 'iife' },
} as const;

export function isBrowserTarget(value: string): value is BrowserTarget {
    return (TARGETS as readonly string[]).includes(value);
}
