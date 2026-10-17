import { classifyAgentCliExitDiagnostic } from '../agent_cli_exit_diagnostic';

describe('agent CLI exit diagnostics', () => {
    it.each([
        ['Failed to create unified exec process: helper_unknown_error: open sandbox setup mutex; secret=fixture-private-value', 'reported-sandbox-setup-mutex'],
        ['windows sandbox failed: helper_unknown_error: open sandbox setup mutex', 'reported-sandbox-setup-mutex'],
        ['open sandbox setup mutex', 'unclassified'],
        ['Error: authentication required', 'reported-authentication'],
        ['HTTP 401 Unauthorized', 'reported-authentication'],
        ['model gpt-6-luna is not available for this account', 'reported-model-unavailable'],
        ["error: unexpected argument '--ignore-rules' found", 'reported-unsupported-option'],
        ['error loading config: unknown configuration key features.multi_agent', 'reported-unsupported-configuration'],
        ['request failed: connection reset', 'reported-transport-or-rate-limit'],
        ['provider request failed: HTTP 429', 'reported-transport-or-rate-limit'],
        ['ERROR: Incomplete response returned, reason: max_output_tokens', 'reported-output-token-limit'],
        ['The issue mentions max_output_tokens and an incomplete response', 'unclassified'],
        ['ERROR: Incomplete response returned, reason: content_filter', 'unclassified'],
        ['secret=fixture-private-value; provider failed', 'unclassified'],
    ] as const)('classifies only a fixed code for %s', (stderr, expected) => {
        const diagnostic = classifyAgentCliExitDiagnostic(stderr);
        expect(diagnostic).toBe(expected);
        expect(diagnostic).not.toContain('fixture-private-value');
    });
});
