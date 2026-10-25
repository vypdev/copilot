import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { buildDevelopmentSet } from './build.mts';
import { validateArtifactSet } from './artifact_validation.mts';
import { validatePackageContract } from './package_contract.mts';
import { readSources } from './source_graph.mts';
import { FoundationGateError } from './gate_error.mts';

const yaml = createRequire(import.meta.url)('js-yaml') as { load(source: string): unknown };

export async function validateDevelopmentBuild(root: string, output: string, build = buildDevelopmentSet): Promise<void> {
    const read = (file: string) => readFile(path.join(root, file), 'utf8');
    validatePackageContract(JSON.parse(await read('package.json')), JSON.parse(await read('extension/package.json')),
        yaml.load(await read('pnpm-workspace.yaml')) as Parameters<typeof validatePackageContract>[2],
        yaml.load(await read('.github/workflows/ci_check.yml')) as Parameters<typeof validatePackageContract>[3]);
    for (const [file, source] of await readSources(root, ['extension/tooling', 'extension/test'])) {
        if (source.split('\n').length > 220) throw new FoundationGateError(`${file}: module-size exceeds 220 lines`);
    }
    await validateArtifactSet(output);
    const temporary = await mkdtemp(path.join(tmpdir(), 'copilot-extension-repro-'));
    try {
        const first = await build(root, path.join(temporary, 'first'));
        const second = await build(root, path.join(temporary, 'second'));
        const existing = JSON.parse(await readFile(path.join(output, 'receipt.json'), 'utf8'));
        if (!isDeepStrictEqual(first, second)) throw new FoundationGateError('reproducibility: clean build receipts differ');
        if (!isDeepStrictEqual(first, existing)) throw new FoundationGateError('reproducibility: existing output is stale; run build:extension');
    } finally {
        await rm(temporary, { recursive: true, force: true });
    }
}
