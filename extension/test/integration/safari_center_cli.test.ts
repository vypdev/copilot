import { expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { safariCenterEntrypoint } from '../../tooling/safari_center_cli.mts';
import * as container from '../../tooling/safari_container.mts';

const entry = fileURLToPath(new URL('../../tooling/safari_center_cli.mts', import.meta.url));
it('H3 CLI is inert on import and rejects target/name/output overrides before building', async () => {
    const build = vi.fn(async () => '/owned/CopilotH3.app'); const previous = process.exitCode; const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
        await safariCenterEntrypoint([], build); await safariCenterEntrypoint(['node', '/other'], build); expect(build).not.toHaveBeenCalled();
        await safariCenterEntrypoint(['node', entry, '--output=foreign'], build); expect(build).not.toHaveBeenCalled(); expect(process.exitCode).toBe(1);
    } finally { process.exitCode = previous; error.mockRestore(); }
});
it('H3 CLI shows only verified local app outcome and gives scoped diagnostics without provider errors on failure', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined); const error = vi.spyOn(console, 'error').mockImplementation(() => undefined); const previous = process.exitCode;
    try {
        await safariCenterEntrypoint(['node', entry], async () => '/owned/CopilotH3.app'); expect(log).toHaveBeenCalledWith(expect.stringContaining('/owned/CopilotH3.app'));
        await safariCenterEntrypoint(['node', entry], async () => { throw new Error('private native error'); });
        expect(error).toHaveBeenCalledWith(expect.stringContaining('.tmp/safari-h3/attempt.json')); expect(error).toHaveBeenCalledWith(expect.not.stringContaining('private native error')); expect(process.exitCode).toBe(1);
    } finally { process.exitCode = previous; log.mockRestore(); error.mockRestore(); }
});
it('H3 default composition always selects its dedicated profile, retaining the existing H2 API default', async () => {
    const build = vi.spyOn(container, 'buildSafariContainer').mockResolvedValue('/owned/CopilotH3.app'); const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
        await safariCenterEntrypoint(['node', entry]); expect(build).toHaveBeenCalledExactlyOnceWith(fileURLToPath(new URL('../../../', import.meta.url)), undefined, 'h3');
    } finally { build.mockRestore(); log.mockRestore(); }
});
