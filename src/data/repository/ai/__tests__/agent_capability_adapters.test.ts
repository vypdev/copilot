import { FindingsAgentAdapter } from '../findings_agent_adapter';
import { FixerAgentAdapter } from '../fixer_agent_adapter';
import type { AgentConfiguration } from '../../../model/agent';

const mockExecute = jest.fn();

jest.mock('../../provider_cli_adapter', () => ({
    ProviderCliAdapter: jest.fn().mockImplementation(() => ({
        execute: mockExecute,
    })),
}));

jest.mock('../../../../utils/logger', () => ({
    logError: jest.fn(),
}));

describe('agent capability adapters', () => {
    const configuration: AgentConfiguration = {
        provider: 'codex',
        modelProvider: 'openai',
        model: 'gpt-5',
        command: 'codex exec --model gpt-5 --config model_provider=openai -',
    };
    const infrastructure = { cli: { execute: jest.fn() } };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns undefined and reports a missing findings configuration', async () => {
        await expect(new FindingsAgentAdapter(infrastructure).query({
            configuration: undefined,
            agentId: 'codex',
            prompt: 'inspect the change',
        })).resolves.toBeUndefined();
    });

    it('executes findings through the provider-neutral CLI and maps plain text', async () => {
        mockExecute.mockResolvedValue('finding summary');

        await expect(new FindingsAgentAdapter(infrastructure).query({
            configuration,
            agentId: 'codex',
            prompt: 'inspect the change',
        })).resolves.toBe('finding summary');

        expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({
            configuration,
            prompt: 'inspect the change',
            timeoutMs: 900000,
        }));
    });

    it('parses structured findings and preserves optional reasoning', async () => {
        mockExecute.mockResolvedValue(JSON.stringify({ findings: [{ id: 'F-1' }] }));

        await expect(new FindingsAgentAdapter(infrastructure).query({
            configuration,
            agentId: 'codex',
            prompt: 'inspect the change',
            options: {
                expectJson: true,
                schema: { type: 'object' },
            },
        })).resolves.toEqual({ findings: [{ id: 'F-1' }] });

        expect(mockExecute).toHaveBeenCalledWith(expect.objectContaining({
            prompt: expect.stringContaining('single JSON object'),
        }));
    });

    it('contains provider execution failures instead of leaking them to the workflow', async () => {
        mockExecute.mockRejectedValue(new Error('CLI unavailable'));

        await expect(new FindingsAgentAdapter(infrastructure).query({
            configuration,
            agentId: 'codex',
            prompt: 'inspect the change',
        })).resolves.toBeUndefined();
    });

    it('returns an explicit CLI session for a successful fixer response', async () => {
        mockExecute.mockResolvedValue('patch applied');

        await expect(new FixerAgentAdapter(infrastructure).fix({
            configuration,
            prompt: 'fix the issue',
        })).resolves.toEqual({ text: 'patch applied', sessionId: 'cli' });
    });

    it('returns undefined when fixer configuration is missing', async () => {
        await expect(new FixerAgentAdapter(infrastructure).fix({
            configuration: undefined,
            prompt: 'fix the issue',
        })).resolves.toBeUndefined();
    });
});
