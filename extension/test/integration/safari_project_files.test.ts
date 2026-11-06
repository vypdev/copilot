import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, open, readFile, rename, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as files from 'node:fs/promises';
import { prepareSafariProject, MAX_SAFARI_PROJECT_BYTES } from '../../tooling/safari_generated_project.mts';

vi.mock('node:fs/promises', async importOriginal => {
    const original = await importOriginal<typeof import('node:fs/promises')>();
    return { ...original, lstat: vi.fn(original.lstat), open: vi.fn(original.open), writeFile: vi.fn(original.writeFile) };
});

let root: string;
const source = 'invalid.extensions.copilot.CopilotH3 MARKETING_VERSION = 1.0;';
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), 'copilot-safari-project-file-')); });
afterEach(async () => { vi.restoreAllMocks(); await rm(root, { recursive: true, force: true }); });
it('project adapter identifies the legacy regular file without creating an alternative layout', async () => {
    await writeFile(path.join(root, 'project.pbxproj'), source); expect(await prepareSafariProject(root, 'h3')).toBe('pbx');
    expect(await readFile(path.join(root, 'project.pbxproj'), 'utf8')).toBe('invalid.extensions.copilot.h3 MARKETING_VERSION = 0.1.0;');
});
it('project normalization works when opening an existing file for truncation returns EINVAL', async () => {
    const file = path.join(root, 'project.pbxproj'); await writeFile(file, source);
    vi.mocked(files.writeFile).mockRejectedValueOnce(Object.assign(new Error('invalid argument'), { code: 'EINVAL' }));
    try {
        expect(await prepareSafariProject(root, 'h3')).toBe('pbx');
        expect(await readFile(file, 'utf8')).toBe('invalid.extensions.copilot.h3 MARKETING_VERSION = 0.1.0;');
    } finally { vi.mocked(files.writeFile).mockReset(); }
});
it('a replaced project path cannot redirect the normalized write to another file', async () => {
    const file = path.join(root, 'project.pbxproj'); const original = path.join(root, 'original');
    await writeFile(file, source); const openFile = vi.mocked(open).getMockImplementation()!;
    vi.mocked(open).mockImplementationOnce(async (...args: Parameters<typeof open>) => {
        await rename(file, original); await writeFile(file, 'replacement'); return openFile(...args);
    });
    try {
        await expect(prepareSafariProject(root, 'h3')).rejects.toThrow('project-not-regular');
        expect(await readFile(file, 'utf8')).toBe('replacement'); expect(await readFile(original, 'utf8')).toBe(source);
    } finally { vi.mocked(open).mockReset(); }
});
it('project adapter refuses missing layouts without creating or compiling a replacement', async () => {
    await expect(prepareSafariProject(root, 'h3')).rejects.toThrow('missing-or-ambiguous');
});
it('project adapter refuses ambiguous dual layouts without mutating either file', async () => {
    for (const name of ['project.pbxproj', 'project.xcproj']) await writeFile(path.join(root, name), source);
    await expect(prepareSafariProject(root, 'h3')).rejects.toThrow('missing-or-ambiguous');
    expect(await readFile(path.join(root, 'project.pbxproj'), 'utf8')).toBe(source);
});
it('project adapter rejects a directory in place of the generated project', async () => {
    await mkdir(path.join(root, 'project.pbxproj')); await expect(prepareSafariProject(root, 'h3')).rejects.toThrow('not-regular');
});
it('project adapter never follows a symlink to another authored file', async () => {
    const authored = path.join(root, 'authored.txt'); await writeFile(authored, source); await symlink(authored, path.join(root, 'project.pbxproj'));
    await expect(prepareSafariProject(root, 'h3')).rejects.toThrow('not-regular'); expect(await readFile(authored, 'utf8')).toBe(source);
});
it('project adapter rejects excessive physical size before reading or rewriting the project', async () => {
    await writeFile(path.join(root, 'project.pbxproj'), source.padEnd(MAX_SAFARI_PROJECT_BYTES + 1, ' '));
    await expect(prepareSafariProject(root, 'h3')).rejects.toThrow('project-size');
});
it('project adapter preserves a malformed JSONC record for inspection instead of replacing it with defaults', async () => {
    const file = path.join(root, 'project.xcproj'); await writeFile(file, '{malformed');
    await expect(prepareSafariProject(root, 'h3')).rejects.toThrow('project-json'); expect(await readFile(file, 'utf8')).toBe('{malformed');
});
it('project adapter propagates a nonmissing filesystem failure without treating it as a missing optional layout', async () => {
    const failure = Object.assign(new Error('permission denied'), { code: 'EACCES' }); vi.mocked(files.lstat).mockRejectedValueOnce(failure);
    await expect(prepareSafariProject(root, 'h3')).rejects.toBe(failure);
});
