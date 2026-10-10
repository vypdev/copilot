import { classifyAgentCliExitDiagnostic } from '../agent_cli_exit_diagnostic';

describe('agent CLI exit diagnostics', () => {
    it.each([
        ['Error: authentication required', 'reported-authentication'],
        ['HTTP 401 Unauthorized', 'reported-authentication'],
        ['model gpt-6-luna is not available for this account', 'reported-model-unavailable'],
        ["error: unexpected argument '--ignore-rules' found", 'reported-unsupported-option'],
        ['error loading config: unknown configuration key features.multi_agent', 'reported-unsupported-configuration'],
        ['request failed: connection reset', 'reported-transport-or-rate-limit'],
        ['provider request failed: HTTP 429', 'reported-transport-or-rate-limit'],
        ['secret=fixture-private-value; provider failed', 'unclassified'],
    ] as const)('classifies only a fixed code for %s', (stderr, expected) => {
        const diagnostic = classifyAgentCliExitDiagnostic(stderr);
        expect(diagnostic).toBe(expected);
        expect(diagnostic).not.toContain('fixture-private-value');
    });
});
