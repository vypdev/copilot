import { ProviderCliAdapter } from '../provider_cli_adapter';
import { CursorCliAdapter } from '../cursor_cli_adapter';
import { CodexCliAdapter } from '../codex_cli_adapter';

describe('provider-specific CLI adapters', () => {
    it('allows Cursor only with cursor/cli configuration', async () => {
        const delegate = { execute: jest.fn().mockResolvedValue('ok') } as unknown as ProviderCliAdapter;
        const adapter = new CursorCliAdapter(delegate);
        await expect(adapter.execute({ configuration: { provider: 'cursor', model: 'cursor', command: 'cursor-agent' }, prompt: 'p', timeoutMs: 1 })).resolves.toBe('ok');
        expect(delegate.execute).toHaveBeenCalledTimes(1);
        expect(() => adapter.execute({ configuration: { provider: 'codex', model: 'codex', command: 'codex' }, prompt: 'p', timeoutMs: 1 })).toThrow('Cursor adapter received codex');
    });

    it('allows Codex only with codex/cli configuration', async () => {
        const delegate = { execute: jest.fn().mockResolvedValue('ok') } as unknown as ProviderCliAdapter;
        const adapter = new CodexCliAdapter(delegate);
        await expect(adapter.execute({ configuration: { provider: 'codex', model: 'codex', command: 'codex' }, prompt: 'p', timeoutMs: 1 })).resolves.toBe('ok');
        await expect(adapter.execute({ configuration: { provider: 'codex', model: 'codex', command: 'codex' }, prompt: 'p', timeoutMs: 1 })).resolves.toBe('ok');
    });
});
