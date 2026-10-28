import { expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { replaceCompleteSet } from '../../tooling/build.mts';
import { readSources } from '../../tooling/source_graph.mts';
import { readTarget, validateArtifactSet } from '../../tooling/artifact_validation.mts';

it('restores the previous complete directory when replacement fails after saving it', async () => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'copilot-h1-replace-'));
    const output = path.join(directory, 'output');
    try {
        await fs.mkdir(output); await fs.writeFile(path.join(output, 'retained'), 'original');
        await expect(replaceCompleteSet(path.join(directory, 'missing-stage'), output)).rejects.toThrow();
        expect(await fs.readFile(path.join(output, 'retained'), 'utf8')).toBe('original');
    } finally { await fs.rm(directory, { recursive: true }); }
});
it('retains interrupted backup evidence and rejects inaccessible output instead of overwriting it', async () => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'copilot-h1-backup-'));
    try {
        const output = path.join(directory, 'output');
        await fs.mkdir(`${output}.previous`);
        await expect(replaceCompleteSet(path.join(directory, 'stage'), output)).rejects.toThrow('interrupted backup');
        expect(await fs.readdir(directory)).toEqual(['output.previous']);
        const denied = Object.assign(new Error('denied'), { code: 'EACCES' });
        const io = { ...fs, lstat: vi.fn(fs.lstat).mockRejectedValue(denied) };
        await expect(replaceCompleteSet('stage', 'output', io)).rejects.toThrow('denied');
        const renameDenied = { ...fs, lstat: vi.fn(fs.lstat).mockRejectedValue(Object.assign(new Error(), { code: 'ENOENT' })),
            rename: vi.fn(fs.rename).mockRejectedValue(denied) };
        await expect(replaceCompleteSet('stage', 'output', renameDenied)).rejects.toThrow('denied');
    } finally { await fs.rm(directory, { recursive: true }); }
});
it('fails a first publication without fabricating or restoring a nonexistent old output', async () => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'copilot-h1-first-'));
    try {
        await expect(replaceCompleteSet(path.join(directory, 'missing-stage'), path.join(directory, 'missing-output'))).rejects.toThrow();
        expect(await fs.readdir(directory)).toEqual([]);
    } finally { await fs.rm(directory, { recursive: true }); }
});
it('keeps the new complete output and old backup when post-replacement cleanup is denied', async () => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'copilot-h1-cleanup-'));
    try {
        const output = path.join(directory, 'output'); const staging = path.join(directory, 'staging');
        await fs.mkdir(output); await fs.mkdir(staging);
        await fs.writeFile(path.join(output, 'marker'), 'old'); await fs.writeFile(path.join(staging, 'marker'), 'new');
        await expect(replaceCompleteSet(staging, output, { ...fs, rm: vi.fn(fs.rm).mockRejectedValue(new Error('denied')) }))
            .rejects.toThrow('New set published');
        expect(await fs.readFile(path.join(output, 'marker'), 'utf8')).toBe('new');
        expect(await fs.readFile(path.join(`${output}.previous`, 'marker'), 'utf8')).toBe('old');
    } finally { await fs.rm(directory, { recursive: true }); }
});
it('rejects symlink source escapes and non-file target artifacts', async () => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'copilot-h1-boundary-'));
    try {
        await fs.mkdir(path.join(directory, 'src')); await fs.writeFile(path.join(directory, 'src/ok.ts'), 'export {};');
        await fs.writeFile(path.join(directory, 'src/ignored.txt'), 'not executable');
        expect([...(await readSources(directory, ['src'])).keys()]).toEqual(['src/ok.ts']);
        await fs.symlink(path.join(directory, 'src/ok.ts'), path.join(directory, 'src/link.ts'));
        await expect(readSources(directory, ['src'])).rejects.toThrow('source-boundary');
        await expect(readTarget(directory)).rejects.toThrow('artifact-boundary');
        await expect(validateArtifactSet(directory)).rejects.toThrow('incomplete or unexpected');
    } finally { await fs.rm(directory, { recursive: true }); }
});
