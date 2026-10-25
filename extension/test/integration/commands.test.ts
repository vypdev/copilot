import { beforeAll, expect, it, vi } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { main, runEntrypoint } from '../../tooling/cli.mts';
import { validateDevelopmentBuild } from '../../tooling/validation.mts';
import type { BuildReceipt } from '../../tooling/build.mts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const entry = fileURLToPath(new URL('../../tooling/cli.mts', import.meta.url));
beforeAll(async () => { await main(['build'], root, () => undefined); }, 60_000);

it('the public validation command performs two actual clean builds and reports the remaining browser gate', async () => {
    const output = vi.fn(); await main(['validate'], root, output);
    expect(output).toHaveBeenCalledWith(expect.stringContaining('two clean reproducible builds'));
    expect(output).toHaveBeenCalledWith(expect.stringContaining('Browser loading remains unverified'));
});
it('rejects undeclared command/output overrides and incompatible runtimes before effects', async () => {
    await expect(main([])).rejects.toThrow('Usage');
    await expect(main(['build', '--output=/tmp/arbitrary'])).rejects.toThrow('Usage');
    const original = process;
    vi.stubGlobal('process', { ...original, versions: { ...original.versions, node: '22.0.0' } });
    try { await expect(main(['build'])).rejects.toThrow('Node 24'); }
    finally { vi.unstubAllGlobals(); }
});
it('runs only as the actual CLI entrypoint and returns a failing exit status with bounded diagnostics', async () => {
    const run = vi.fn().mockResolvedValue(undefined);
    await runEntrypoint(['node'], run); await runEntrypoint(['node', 'other.mts'], run);
    expect(run).not.toHaveBeenCalled();
    await runEntrypoint(['node', entry, 'build'], run); expect(run).toHaveBeenCalledWith(['build']);
    const previous = process.exitCode; const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
        await runEntrypoint(['node', entry, 'invalid']); expect(process.exitCode).toBe(1);
        expect(error).toHaveBeenCalledWith(expect.stringContaining('Usage'));
        await runEntrypoint(['node', entry], vi.fn().mockRejectedValue('untrusted text'));
        expect(error).toHaveBeenCalledWith('Extension check failed; inspect phase and retry.');
    } finally { process.exitCode = previous; error.mockRestore(); }
});
it('rejects distinct clean-build results and stale current receipts', async () => {
    const output = path.join(root, 'extension/dist');
    const receipt = JSON.parse(await readFile(path.join(output, 'receipt.json'), 'utf8')) as BuildReceipt;
    const changed = { ...receipt, sourceTreeSha256: 'changed' };
    const inconsistent = vi.fn().mockResolvedValueOnce(receipt).mockResolvedValueOnce(changed);
    await expect(validateDevelopmentBuild(root, output, inconsistent)).rejects.toThrow('clean build receipts differ');
    await expect(validateDevelopmentBuild(root, output, vi.fn().mockResolvedValue(changed))).rejects.toThrow('existing output is stale');
});
it('rejects oversized tooling modules before advertising a valid artifact set', async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'copilot-h1-size-'));
    try {
        for (const file of ['package.json', 'extension/package.json', 'pnpm-workspace.yaml', '.github/workflows/ci_check.yml']) {
            await mkdir(path.dirname(path.join(temporary, file)), { recursive: true });
            await writeFile(path.join(temporary, file), await readFile(path.join(root, file)));
        }
        await mkdir(path.join(temporary, 'extension/tooling'), { recursive: true });
        await mkdir(path.join(temporary, 'extension/test'));
        await writeFile(path.join(temporary, 'extension/tooling/oversized.mts'), '\n'.repeat(221));
        await expect(validateDevelopmentBuild(temporary, path.join(temporary, 'absent'))).rejects.toThrow('module-size');
    } finally { await rm(temporary, { recursive: true }); }
});
