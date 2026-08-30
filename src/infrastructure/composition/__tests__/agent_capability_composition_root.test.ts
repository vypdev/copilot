import { createFindingsQueryPort, createFixerQueryPort, createLanguageQueryPort } from '../agent_capability_composition_root';
import type { AgentCliPort } from '../../agents/ports/agent_provider_ports';

describe('agent capability composition root', () => {
    it('binds both semantic agent capabilities to the same provider-neutral CLI port', async () => {
        const execute = jest.fn().mockResolvedValue('agent output');
        const cli: AgentCliPort = { execute };
        const configuration = {
            provider: 'codex' as const,
            modelProvider: 'openai',
            model: 'gpt-5',
            command: 'codex exec --model gpt-5 --config model_provider=openai -',
        };

        const findings = createFindingsQueryPort({ cli });
        const fixer = createFixerQueryPort({ cli });
        const language = createLanguageQueryPort({ cli });

        await expect(findings.query({ configuration, agentId: 'codex', prompt: 'inspect' })).resolves.toBe('agent output');
        await expect(fixer.fix({ configuration, prompt: 'fix' })).resolves.toEqual({ text: 'agent output', sessionId: 'cli' });
        await expect(language.query({ configuration, agentId: 'language', prompt: 'translate' })).resolves.toBe('agent output');
        expect(execute).toHaveBeenCalledTimes(3);
    });
});
