import { bugbotFramedPromptBytes } from '../bugbot_framed_prompt_policy';
import { FindingsAgentAdapter } from '../../../data/repository/ai/findings_agent_adapter';
import type { FindingsQueryRequest } from '../../ports/agent_findings_ports';

it.each([
    undefined, {}, { expectJson: false }, { expectJson: true },
    { expectJson: true, schema: { type: 'object' } },
    { expectJson: true, schema: { type: 'object' }, schemaName: 'native-contract' },
])('matches the exact bytes handed to the native CLI for options %j', async options => {
    const execute = jest.fn(async (_request: { prompt: string }) => '{}');
    const adapter = new FindingsAgentAdapter({ cli: { execute } });
    const request: FindingsQueryRequest = { agentId: 'fixture', configuration: { provider: 'codex', model: 'fixture', executable: 'codex', effort: ' high ' },
        prompt: 'Read exact source 🚀', options };
    await adapter.query(request);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(bugbotFramedPromptBytes(request)).toBe(Buffer.byteLength(execute.mock.calls[0][0].prompt));
});
it('counts the default native wrapper even before a configuration is available', () => {
    const request: FindingsQueryRequest = { agentId: 'fixture', configuration: undefined, prompt: 'x' };
    expect(bugbotFramedPromptBytes(request)).toBeGreaterThan(1);
});
