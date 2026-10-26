import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { buildDevelopmentSet, type BuildReceipt } from '../../tooling/build.mts';
import { readTarget, validateArtifactSet } from '../../tooling/artifact_validation.mts';
import { TARGETS } from '../../src/domain/target.ts';
import { PublishedCleanupError } from '../../tooling/gate_error.mts';

import { RUNTIME_HTML } from '../../tooling/static_assets.mts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
let temporary: string;
let first: BuildReceipt;
let second: BuildReceipt;
beforeAll(async () => {
    temporary = await mkdtemp(path.join(tmpdir(), 'copilot-h1-build-test-'));
    first = await buildDevelopmentSet(root, path.join(temporary, 'first'));
    second = await buildDevelopmentSet(root, path.join(temporary, 'second'));
}, 60_000);
afterAll(async () => { await rm(temporary, { recursive: true, force: true }); });

it('bexh1-foundation-C23 builds actual declared target assets whose content entry remains inert', async () => {
    await validateArtifactSet(path.join(temporary, 'first'));
    expect(first.evidence).toBe('development-build-only');
    expect(first.sourceRevision).toMatch(/^[a-f0-9]{40}$/u);
    for (const target of TARGETS) {
        const files = await readTarget(path.join(temporary, 'first', target));
        expect([...files.keys()].sort()).toEqual(['background.js', 'content.js', 'manifest.json', 'runtime.html', 'runtime.js']);
        for (const href of ['https://github.com/owner/repo', 'https://github.com/settings/tokens']) {
            const context = { location: { href } };
            // A VM is an inertness check, explicitly not actual extension-loaded browser proof.
            runInNewContext(files.get('content.js')!, context);
            expect(Object.keys(context)).toEqual(['location']);
        }
    }
});
it('bexh1-foundation-C24 compares actual bytes and receipts from two clean complete builds', async () => {
    expect(first).toEqual(second);
    for (const target of TARGETS) {
        expect(await readTarget(path.join(temporary, 'first', target))).toEqual(await readTarget(path.join(temporary, 'second', target)));
    }
    expect(await readFile(path.join(temporary, 'first/receipt.json'), 'utf8')).toBe(await readFile(path.join(temporary, 'second/receipt.json'), 'utf8'));
});
it('bexh1-foundation-C26 rejects a target failure, removes staging and retains the previous complete set', async () => {
    const output = path.join(temporary, 'first');
    await expect(buildDevelopmentSet(root, output, async (target, directory) => {
        if (target === 'firefox') throw new Error('private arbitrary bundler exception');
        await writeFile(path.join(directory, 'background.js'), ''); await writeFile(path.join(directory, 'content.js'), '');
        await writeFile(path.join(directory, 'runtime.html'), RUNTIME_HTML); await writeFile(path.join(directory, 'runtime.js'), '');
    })).rejects.toThrow('build/firefox: development set not replaced');
    expect(JSON.parse(await readFile(path.join(output, 'receipt.json'), 'utf8'))).toEqual(first);
    expect((await readdir(temporary)).filter(name => name.startsWith('first.'))).toEqual([]);
    await expect(validateArtifactSet(output)).resolves.toBeUndefined();
});
it('bexh1-foundation-C27 replaces complete output on corrected retry and removes stale assets', async () => {
    const output = path.join(temporary, 'first');
    await writeFile(path.join(output, 'chrome/stale.js'), 'obsolete');
    await expect(validateArtifactSet(output)).rejects.toThrow('undeclared-or-missing-asset');
    expect(await buildDevelopmentSet(root, output)).toEqual(first);
    await expect(validateArtifactSet(output)).resolves.toBeUndefined();
    expect((await readdir(temporary)).filter(name => name.startsWith('first.'))).toEqual([]);
});
it('refuses concurrent builds and does not delete another build lock', async () => {
    const output = path.join(temporary, 'locked'); await mkdir(`${output}.lock`);
    await expect(buildDevelopmentSet(root, output)).rejects.toThrow('output locked');
    expect(await readdir(`${output}.lock`)).toEqual([]);
});
it('rejects invalid revision evidence before staging and exposes no private input', async () => {
    const output = path.join(temporary, 'invalid-revision');
    await expect(buildDevelopmentSet(root, output, undefined, { revision: () => 'invalid private value' }))
        .rejects.toThrow('source-revision: expected commit SHA');
    expect((await readdir(temporary)).filter(name => name.startsWith('invalid-revision'))).toEqual([]);
});
it('retains actionable trusted gate diagnostics when bundle validation fails', async () => {
    const output = path.join(temporary, 'invalid-bundle');
    await expect(buildDevelopmentSet(root, output, async (_target, directory) => {
        await writeFile(path.join(directory, 'background.js'), 'require("node:fs")');
        await writeFile(path.join(directory, 'content.js'), '');
        await writeFile(path.join(directory, 'runtime.html'), RUNTIME_HTML); await writeFile(path.join(directory, 'runtime.js'), '');
    })).rejects.toThrow('chrome/background.js: forbidden-executable-or-runtime');
    expect((await readdir(temporary)).filter(name => name.startsWith('invalid-bundle'))).toEqual([]);
});
it('reports completed replacement honestly when backup cleanup fails after publication', async () => {
    const output = path.join(temporary, 'published');
    await expect(buildDevelopmentSet(root, output, async (_target, directory) => {
        await writeFile(path.join(directory, 'background.js'), ''); await writeFile(path.join(directory, 'content.js'), '');
        await writeFile(path.join(directory, 'runtime.html'), RUNTIME_HTML); await writeFile(path.join(directory, 'runtime.js'), '');
    }, { publish: async (staging, destination) => { await rename(staging, destination); throw new PublishedCleanupError('retained backup'); } }))
        .rejects.toThrow('complete NEW set is present');
    await expect(validateArtifactSet(output)).resolves.toBeUndefined();
});
