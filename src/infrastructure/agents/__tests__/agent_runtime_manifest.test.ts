import { AGENT_EXECUTABLE_BASENAMES } from '../../../domain/agent';
import { assertAgentRuntimeVersion, getAgentRuntimeManifest } from '../agent_runtime_manifest';

describe('agent runtime manifest', () => {
    it('pins every provider to its reviewed executable and exact version', () => {
        const manifest = getAgentRuntimeManifest();
        expect(manifest.revision).toBe('2026-09-12.p1-c.1');
        expect(manifest.providers).toEqual({
            codex: { executable: 'codex', version: 'codex-cli 0.153.4', package: '@openai/codex' },
            opencode: { executable: 'opencode', version: '1.18.3', package: 'opencode-ai' },
            cursor: { executable: 'agent', version: '2026.09.10-fd3934a' },
        });
        expect(Object.fromEntries(Object.entries(manifest.providers).map(([provider, entry]) => [provider, entry.executable]))).toEqual(AGENT_EXECUTABLE_BASENAMES);
    });

    it.each([
        ['codex', 'codex-cli 0.153.4\n'],
        ['opencode', '1.18.3'],
        ['cursor', '2026.09.10-fd3934a\r\n'],
    ] as const)('accepts only exact %s version output', (provider, output) => {
        expect(assertAgentRuntimeVersion(provider, output)).toBe(output.trim());
    });

    it.each([
        ['codex', 'codex-cli 0.153.5'], ['opencode', 'v1.18.3'], ['cursor', ''],
    ] as const)('rejects mismatched or unparseable %s output', (provider, output) => {
        expect(() => assertAgentRuntimeVersion(provider, output)).toThrow('version mismatch');
    });
});
