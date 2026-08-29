import { CodexCliAdapter, CursorCliAdapter, OpenCodeCliAdapter } from '../provider_specific_cli_adapters';
import type { AgentCliPort } from '../../../infrastructure/agents/ports/agent_provider_ports';

describe('provider-specific CLI adapters', () => {
    it('allows Cursor only with cursor/cli configuration', async () => {
        const execute = jest.fn().mockResolvedValue('ok');
        const adapter = new CursorCliAdapter({ execute } as unknown as AgentCliPort);
        await expect(adapter.execute({ configuration: { provider: 'cursor', model: 'cursor', command: 'agent -p --model cursor' }, prompt: 'p', timeoutMs: 1 })).resolves.toBe('ok');
        expect(execute).toHaveBeenCalledWith({ command: 'agent -p --model cursor', prompt: 'p', provider: 'cursor', promptMode: 'argv', timeoutMs: 1, cwd: undefined, signal: undefined });
        expect(execute).toHaveBeenCalledTimes(1);
        expect(() => adapter.execute({ configuration: { provider: 'codex', model: 'codex', command: 'codex exec --model codex --config model_provider=openai -' }, prompt: 'p', timeoutMs: 1 })).toThrow('cursor CLI adapter received codex');
    });

    it('allows Codex only with codex/cli configuration', async () => {
        const execute = jest.fn().mockResolvedValue('ok');
        const adapter = new CodexCliAdapter({ execute } as unknown as AgentCliPort);
        await expect(adapter.execute({ configuration: { provider: 'codex', model: 'codex', command: 'codex exec --model codex --config model_provider=openai -' }, prompt: 'p', timeoutMs: 1 })).resolves.toBe('ok');
        expect(execute).toHaveBeenCalledWith({ command: 'codex exec --model codex --config model_provider=openai -', prompt: 'p', provider: 'codex', promptMode: 'stdin', timeoutMs: 1, cwd: undefined, signal: undefined });
    });

    it('allows OpenCode only with opencode configuration', async () => {
        const execute = jest.fn().mockResolvedValue('ok');
        const adapter = new OpenCodeCliAdapter({ execute } as unknown as AgentCliPort);
        await expect(adapter.execute({ configuration: { provider: 'opencode', model: 'model', command: 'opencode run --model openai/model' }, prompt: 'p', timeoutMs: 1 })).resolves.toBe('ok');
        expect(() => adapter.execute({ configuration: { provider: 'cursor', model: 'model', command: 'agent -p --model model' }, prompt: 'p', timeoutMs: 1 })).toThrow('opencode CLI adapter received cursor');
    });
});
