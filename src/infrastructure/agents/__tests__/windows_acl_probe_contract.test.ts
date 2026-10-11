import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyWindowsAgentExecutableAcl, systemTool } from '../windows_executable_trust.cjs';
const mockRoot = jest.fn(() => 'C:\\Windows');
jest.mock('node:child_process', () => ({ execFileSync: jest.fn() }));
jest.mock('node:fs', () => ({ realpathSync: jest.fn() }));
jest.mock('../windows_system_root.cjs', () => ({ trustedWindowsSystemRoot: () => mockRoot() }));
const execute = jest.mocked(execFileSync);
const canonicalize = jest.mocked(realpathSync);
const user = 'S-1-5-21-100-200-300-1001';
const safe = `O:${user}G:SYD:AI(A;;FA;;;${user})(A;ID;FRFX;;;BU)`;
const executable = join(tmpdir(), 'copilot-probe', 'agent.exe');
let batch: string[];
beforeEach(() => {
    jest.clearAllMocks(); mockRoot.mockReturnValue('C:\\Windows'); canonicalize.mockReturnValue(executable);
    batch = [safe]; let parent = dirname(executable);
    for (;;) { batch.push(safe); const next = dirname(parent); if (next === parent) break; parent = next; }
    execute.mockImplementation((_file, args) => (Array.isArray(args) && args.includes('-EncodedCommand')
        ? JSON.stringify(batch) : `"host\\runner","${user}"`) as never);
});
function encoded() {
    const call = execute.mock.calls.find(([, args]) => Array.isArray(args) && args.includes('-EncodedCommand'))!;
    const args = call[1] as readonly string[];
    return { call, command: Buffer.from(args[args.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le') };
}
describe('trusted Windows ACL probe invocation', () => {
    it('explicitly imports only the trusted system Utility manifest without command-discovery fallback', () => {
        verifyWindowsAgentExecutableAcl(executable); const { command, call } = encoded();
        const manifest = systemTool(join('WindowsPowerShell', 'v1.0', 'Modules', 'Microsoft.PowerShell.Utility', 'Microsoft.PowerShell.Utility.psd1'));
        expect(command).toContain(`Import-Module -Name '${manifest}' -ErrorAction Stop;`);
        expect(command.indexOf("$PSModuleAutoLoadingPreference='None'")).toBeLessThan(command.indexOf('Import-Module'));
        expect(command.indexOf('Import-Module')).toBeLessThan(command.indexOf('ConvertTo-Json'));
        expect(call[1]).toEqual(expect.arrayContaining(['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand']));
        expect(call[2]).toMatchObject({ timeout: 15_000, maxBuffer: 1_048_576, windowsHide: true,
            env: { PSModuleAnalysisCachePath: 'NUL' } });
        expect(Object.keys((call[2] as { env: Record<string, string> }).env).sort()).toEqual(['PATH', 'PSModuleAnalysisCachePath', 'PSModulePath', 'SystemRoot', 'WINDIR']);
    });
    it('escapes a trusted system-root apostrophe in the fixed manifest literal', () => {
        mockRoot.mockReturnValue("C:\\Win'dows"); verifyWindowsAgentExecutableAcl(executable);
        expect(encoded().command).toContain("C:\\Win''dows");
    });
    it('continues rejecting unsafe descriptor owners after the explicit import', () => {
        batch[0] = 'O:BUD:AI(A;;FA;;;BU)'; expect(() => verifyWindowsAgentExecutableAcl(executable)).toThrow('Unsafe executable ACL owner');
    });
    it('continues rejecting incomplete descriptor batches rather than skipping ancestors', () => {
        batch.pop(); expect(() => verifyWindowsAgentExecutableAcl(executable)).toThrow('Incomplete Windows executable ACL descriptor batch');
    });
    it('preserves the descriptor timeout and its closed diagnostic stage', () => {
        const timeout = Object.assign(new Error('probe'), { code: 'ETIMEDOUT', aclProbeStage: undefined as string | undefined });
        execute.mockImplementation((_file, args) => { if (Array.isArray(args) && args.includes('-EncodedCommand')) throw timeout; return `"host\\runner","${user}"` as never; });
        expect(() => verifyWindowsAgentExecutableAcl(executable)).toThrow(timeout); expect(timeout.aclProbeStage).toBe('descriptor');
    });
});
