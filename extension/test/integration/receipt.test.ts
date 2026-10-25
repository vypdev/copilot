import { afterAll, beforeAll, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDevelopmentSet } from '../../tooling/build.mts';
import { validateArtifactSet, validateTarget, readTarget } from '../../tooling/artifact_validation.mts';
import { validateDevelopmentBuild } from '../../tooling/validation.mts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
let temporary: string;
let output: string;
let receipt: string;
beforeAll(async () => {
    temporary = await mkdtemp(path.join(tmpdir(), 'copilot-h1-receipt-'));
    output = path.join(temporary, 'output');
    await buildDevelopmentSet(root, output);
    receipt = await readFile(path.join(output, 'receipt.json'), 'utf8');
});
afterAll(async () => { await rm(temporary, { recursive: true, force: true }); });

async function rejectReceipt(value: unknown, reason: string): Promise<void> {
    try {
        await writeFile(path.join(output, 'receipt.json'), `${JSON.stringify(value, null, 2)}\n`);
        await expect(validateArtifactSet(output)).rejects.toThrow(reason);
    } finally { await writeFile(path.join(output, 'receipt.json'), receipt); }
}

it('rejects an otherwise valid bundle changed after its receipt, including the public validation flow', async () => {
    const file = path.join(output, 'chrome/content.js'); const original = await readFile(file, 'utf8');
    try {
        await writeFile(file, `${original}\nvoid 0;\n`);
        validateTarget('chrome', await readTarget(path.join(output, 'chrome')));
        await expect(validateArtifactSet(output)).rejects.toThrow('chrome: receipt-hash-mismatch');
        await expect(validateDevelopmentBuild(root, output)).rejects.toThrow('receipt-hash-mismatch');
    } finally { await writeFile(file, original); }
    await expect(validateArtifactSet(output)).resolves.toBeUndefined();
});

it('rejects malformed JSON and non-object receipt inputs', async () => {
    try {
        await writeFile(path.join(output, 'receipt.json'), '{bad');
        await expect(validateArtifactSet(output)).rejects.toThrow('receipt: malformed JSON');
    } finally { await writeFile(path.join(output, 'receipt.json'), receipt); }
    for (const value of [null, false, 'text', []]) await rejectReceipt(value, 'invalid closed metadata');
});
it('rejects unknown, missing, future and oversized metadata with invalid provenance', async () => {
    const valid = JSON.parse(receipt);
    const missing = { ...valid }; delete missing.evidence;
    for (const value of [{ ...valid, extra: 'x' }, missing, { ...valid, schemaVersion: 2 }, { ...valid, evidence: 'browser-loaded' },
        { ...valid, sourceRevision: 1 }, { ...valid, sourceRevision: 'bad' }, { ...valid, sourceRevision: `${'0'.repeat(40)}\n` },
        { ...valid, sourceTreeSha256: null }, { ...valid, sourceTreeSha256: 'bad' },
        { ...valid, sourceTreeSha256: `${'0'.repeat(64)}\n` }, { ...valid, sourceRevision: '0'.repeat(17_000) },
        { ...valid, targets: null }, { ...valid, targets: [] }, { ...valid, targets: { ...valid.targets, extra: {} } }]) {
        await rejectReceipt(value, 'invalid closed metadata');
    }
});
it('rejects noncanonical and duplicate-key receipts', async () => {
    for (const value of [JSON.stringify(JSON.parse(receipt)), receipt.replace('"schemaVersion": 1,', '"schemaVersion": 1, "schemaVersion": 1,')]) {
        try {
            await writeFile(path.join(output, 'receipt.json'), value);
            await expect(validateArtifactSet(output)).rejects.toThrow('invalid closed metadata');
        } finally { await writeFile(path.join(output, 'receipt.json'), receipt); }
    }
});
it('rejects missing, added, mistyped and altered asset hashes for every target', async () => {
    const valid = JSON.parse(receipt);
    for (const target of ['chrome', 'firefox', 'safari']) {
        for (const hashes of [null, {}, { ...valid.targets[target], 'extra.js': '0'.repeat(64) },
            { ...valid.targets[target], 'content.js': 1 }, { ...valid.targets[target], 'content.js': '0'.repeat(64) }]) {
            await rejectReceipt({ ...valid, targets: { ...valid.targets, [target]: hashes } }, `${target}: receipt-hash-mismatch`);
        }
    }
});
it('rejects invalid UTF-8 instead of hashing replacement characters as if they were original bytes', async () => {
    const file = path.join(output, 'chrome/content.js'); const original = await readFile(file);
    try {
        await writeFile(file, Buffer.from([0xff]));
        await expect(validateArtifactSet(output)).rejects.toThrow('valid UTF-8 text required');
    } finally { await writeFile(file, original); }
});
it('rejects a consistently rehashed changed bundle when comparing it to clean source builds', async () => {
    const file = path.join(output, 'chrome/content.js'); const original = await readFile(file, 'utf8');
    try {
        const { assetHashes } = await import('../../tooling/artifact_validation.mts');
        await writeFile(file, `${original}\nvoid 0;\n`);
        const changed = JSON.parse(receipt); changed.targets.chrome = assetHashes(await readTarget(path.join(output, 'chrome')));
        await writeFile(path.join(output, 'receipt.json'), `${JSON.stringify(changed, null, 2)}\n`);
        await validateArtifactSet(output);
        await expect(validateDevelopmentBuild(root, output)).rejects.toThrow('existing output is stale');
    } finally { await writeFile(file, original); await writeFile(path.join(output, 'receipt.json'), receipt); }
});
