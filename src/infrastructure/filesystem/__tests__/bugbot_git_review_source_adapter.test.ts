import { execFileSync } from 'node:child_process';
import child from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { BugbotGitReviewSourceAdapter, completeTextPatch } from '../bugbot_git_review_source_adapter';
import type { BugbotPullRequestIdentity } from '../../../domain/bugbot/context';
import type { PullRequestReviewChange } from '../../../application/ports/bugbot_pull_request_read_ports';
import { BugbotReviewCompletenessError } from '../../../domain/bugbot/framed_review';

function repository(oldFiles: Record<string, string | Buffer>, newFiles: Record<string, string | Buffer>, format: 'sha1' | 'sha256' = 'sha1') {
    const root = mkdtempSync(join(tmpdir(), 'copilot-framed-git-'));
    const git = (...args: string[]) => execFileSync('git', ['-C', root,
        '-c', 'user.name=Review fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', '-c', 'core.filemode=true',
        '-c', `core.hooksPath=${join(root, '.git', 'absent-hooks')}`, ...args], {
        encoding: 'utf8', env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))),
    }).trim();
    const write = (files: Record<string, string | Buffer>) => {
        for (const [name, body] of Object.entries(files)) {
            mkdirSync(dirname(join(root, name)), { recursive: true }); writeFileSync(join(root, name), body);
        }
    };
    const commit = (message: string) => { git('add', '--all'); git('commit', '--allow-empty', '-qm', message); return git('rev-parse', 'HEAD'); };
    git('init', '-q', `--object-format=${format}`); write(oldFiles); const base = commit('base');
    for (const name of Object.keys(oldFiles)) if (!(name in newFiles)) rmSync(join(root, name));
    write(newFiles); const head = commit('head');
    const pr = (count: number): BugbotPullRequestIdentity => ({ number: 7, state: 'open', draft: false,
        baseRepository: { owner: 'owner', name: 'repo' }, baseSha: base, baseRefSha: base, baseRef: 'develop',
        headRepositoryOwner: 'owner', headRepositoryName: 'repo', headRef: 'feature/review', headSha: head, changedFileCount: count });
    const read = (changes: PullRequestReviewChange[], complete = true, identity = pr(changes.length)) =>
        new BugbotGitReviewSourceAdapter(root).readCompleteSource(identity,
            { changes, filesWithFirstDiffLine: [], filesWithDiffLocations: [] }, complete, []);
    return { root, git, base, head, pr, read, dispose: () => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }) };
}
const change = (filename: string, status = 'modified', additions = 1, deletions = 1, patch = ''): PullRequestReviewChange =>
    ({ filename, status, additions, deletions, patch });

it.each([
    ['added', {}, { 'new.txt': 'new\n' }, change('new.txt', 'added', 1, 0)],
    ['modified', { 'file.txt': 'old\n' }, { 'file.txt': 'new\n' }, change('file.txt')],
    ['removed', { 'old.txt': 'old\n' }, {}, change('old.txt', 'removed', 0, 1)],
] as const)('recovers an absent %s patch from immutable Git without mutating the checkout', async (_kind, oldFiles, newFiles, expected) => {
    const fixture = repository(oldFiles, newFiles);
    try {
        const before = fixture.git('status', '--porcelain');
        const source = await fixture.read([expected]);
        expect(source.changes[0]).toMatchObject({ ...expected, source: 'local-git', patch: expect.stringContaining('@@ ') });
        expect(completeTextPatch(source.changes[0].patch, expected.additions, expected.deletions)).toBe(true);
        expect(source.identity.mergeBaseSha).toBe(fixture.base);
        expect(fixture.git('status', '--porcelain')).toBe(before);
        expect(fixture.git('rev-parse', 'HEAD')).toBe(fixture.head);
    } finally { fixture.dispose(); }
});

it('retains a complete provider patch and still establishes the unique immutable merge-base', async () => {
    const fixture = repository({ 'file': 'old\n' }, { 'file': 'new\n' });
    try {
        const patch = '@@ -1 +1 @@\n-old\n+new\n';
        const source = await fixture.read([change('file', 'modified', 1, 1, patch)]);
        expect(source.changes[0]).toMatchObject({ patch, source: 'provider' });
        expect(Object.isFrozen(source.changes[0])).toBe(true);
    } finally { fixture.dispose(); }
});

it('recovers a truncated provider patch instead of trusting its declared coverage', async () => {
    const fixture = repository({ 'file': 'old\n' }, { 'file': 'new\n' });
    try {
        const source = await fixture.read([change('file', 'modified', 1, 1, '@@ -1 +1 @@\n-old\n')]);
        expect(source.changes[0].source).toBe('local-git');
        expect(source.changes[0].patch).toContain('+new');
    } finally { fixture.dispose(); }
});

it.each([
    ['native count mismatch', (f: ReturnType<typeof repository>) => f.read([change('file')], true, f.pr(2))],
    ['incomplete native enumeration', (f: ReturnType<typeof repository>) => f.read([change('file')], false)],
    ['closed canonical PR', (f: ReturnType<typeof repository>) => f.read([change('file')], true, { ...f.pr(1), state: 'closed' })],
    ['missing base fact', (f: ReturnType<typeof repository>) => f.read([change('file')], true, { ...f.pr(1), baseRefSha: undefined })],
    ['missing head repository', (f: ReturnType<typeof repository>) => f.read([change('file')], true, { ...f.pr(1), headRepositoryName: undefined })],
    ['unavailable immutable commit', (f: ReturnType<typeof repository>) => f.read([change('file')], true, { ...f.pr(1), baseRefSha: 'f'.repeat(40) })],
    ['mismatched native change counts', (f: ReturnType<typeof repository>) => f.read([change('file', 'modified', 2, 1)])],
    ['wrong native file status', (f: ReturnType<typeof repository>) => f.read([change('file', 'added', 1, 0)])],
    ['absent required path', (f: ReturnType<typeof repository>) => f.read([change('absent')])],
] as const)('fails closed on %s', async (_name, read) => {
    const fixture = repository({ 'file': 'old\n' }, { 'file': 'new\n' });
    try { await expect(read(fixture)).rejects.toBeInstanceOf(BugbotReviewCompletenessError); }
    finally { fixture.dispose(); }
});

it.each([
    ['NUL binary', Buffer.from('binary\0content')],
    ['invalid UTF-8', Buffer.from([0xff, 0xfe, 0x41])],
    ['oversized regular text blob', Buffer.alloc(4 * 1024 * 1024 + 1, 97)],
] as const)('rejects required %s source', async (_kind, bytes) => {
    const fixture = repository({}, { file: bytes });
    try { await expect(fixture.read([change('file', 'added', 1, 0)])).rejects.toBeInstanceOf(BugbotReviewCompletenessError); }
    finally { fixture.dispose(); }
});

it('recovers a rename against its previous immutable blob path', async () => {
    const fixture = repository({ old: 'old\n' }, { current: 'new\n' });
    try {
        const source = await fixture.read([{ ...change('current', 'renamed'), previousFilename: 'old' }]);
        expect(source.changes[0].patch).toContain('-old\n+new');
    } finally { fixture.dispose(); }
});

it('represents a zero-line rename as verified object/path metadata, not a missing-source placeholder', async () => {
    const fixture = repository({ old: 'same\n' }, { current: 'same\n' });
    try {
        const source = await fixture.read([{ ...change('current', 'renamed', 0, 0), previousFilename: 'old' }]);
        expect(JSON.parse(source.changes[0].patch)).toMatchObject({ kind: 'verified-metadata-only', oldPath: 'old', path: 'current' });
        expect(source.changes[0].source).toBe('local-git');
    } finally { fixture.dispose(); }
});

it('does not mistake an unchanged empty file for recovered changed source', async () => {
    const fixture = repository({ file: '' }, { file: '' });
    try { await expect(fixture.read([change('file', 'modified', 0, 0)])).rejects.toBeInstanceOf(BugbotReviewCompletenessError); }
    finally { fixture.dispose(); }
});

it('treats literal Git path metacharacters as data and preserves their exact path', async () => {
    // Brackets, wildcards and colon are permitted Git names on Unix; use brackets on Windows too.
    const name = 'src/[literal].txt';
    const fixture = repository({}, { [name]: 'safe\n' });
    try {
        const source = await fixture.read([change(name, 'added', 1, 0)]);
        expect(source.changes[0].filename).toBe(name);
        expect(source.changes[0].patch).toContain('+safe');
    } finally { fixture.dispose(); }
});

it('disables native external execution/network and strips ambient credentials from every fixed-argv read', async () => {
    const fixture = repository({ file: 'old\n' }, { file: 'new\n' });
    const execute = jest.spyOn(child, 'execFile');
    try {
        fixture.git('config', 'diff.external', 'must-never-execute');
        fixture.git('config', 'diff.textconv', 'must-never-execute');
        await fixture.read([change('file')]);
        expect(execute).toHaveBeenCalled();
        for (const call of execute.mock.calls) {
            expect(call[0]).toBe('git');
            const args = call[1] as string[];
            expect(args).toEqual(expect.arrayContaining(['--no-replace-objects', '--no-lazy-fetch', '--literal-pathspecs', 'protocol.allow=never']));
            const options = call[2] as any;
            expect(options.env).toMatchObject({ GIT_ALLOW_PROTOCOL: '', GIT_NO_LAZY_FETCH: '1', GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' });
            expect(Object.keys(options.env).some(key => /TOKEN|SECRET|PASSWORD|SSH_AUTH/u.test(key))).toBe(false);
            expect(options.timeout).toBe(30000);
            if (args.includes('diff')) {
                expect(args).toEqual(expect.arrayContaining(['--no-ext-diff', '--no-textconv']));
                if (!args.includes('--raw')) expect(args).toContain('--text');
            }
        }
    } finally { execute.mockRestore(); fixture.dispose(); }
});

it('bugbot-framed-C067 recovers64 absent added patches under all independent source limits', async () => {
    const files = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`file${i}`, `new${i}\n`]));
    const fixture = repository({}, files);
    try {
        const source = await fixture.read(Object.keys(files).map(name => change(name, 'added', 1, 0)));
        expect(source.changes).toHaveLength(64);
        expect(source.changes.every(x => x.source === 'local-git')).toBe(true);
    } finally { fixture.dispose(); }
}, 30000);

it('bugbot-framed-C068 blocks the65th missing patch before Git reads', async () => {
    const files = Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`file${i}`, `new${i}\n`]));
    const fixture = repository({}, files);
    const execute = jest.spyOn(child, 'execFile');
    try {
        await expect(fixture.read(Object.keys(files).map(name => change(name, 'added', 1, 0))))
            .rejects.toMatchObject({ facts: { resource: 'recoveredFiles', observed: 65, limit: 64 } });
        expect(execute).not.toHaveBeenCalled();
    } finally { execute.mockRestore(); fixture.dispose(); }
});

it.each([
    33, 34,
] as const)('bounded batch verification admits64 paths and %s distinct old blobs', async (oldCount) => {
    const oldFiles = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`file${i}`, `old${i % oldCount}\n`]));
    const newFiles = Object.fromEntries(Array.from({ length: 64 }, (_, i) => [`file${i}`, `new${i % 52}\n`]));
    const fixture = repository(oldFiles, newFiles);
    const execute = jest.spyOn(child, 'execFile');
    try {
        const read = fixture.read(Object.keys(oldFiles).map(name => change(name)));
        expect((await read).changes).toHaveLength(64);
        expect(execute.mock.calls.length).toBeLessThanOrEqual(256);
        expect(execute.mock.calls.filter(call => (call[1] as string[]).includes('--batch'))).toHaveLength(1);
        expect(execute.mock.calls.filter(call => (call[1] as string[]).includes('--batch-check'))).toHaveLength(1);
        const source = await read;
        expect(new Set(source.changes.flatMap(item => [item.git!.old!.oid, item.git!.current!.oid])).size).toBe(oldCount + 52);
    } finally { execute.mockRestore(); fixture.dispose(); }
}, 30000);

it.each([
    ['@@ -1 +1 @@\n-old\n+new\n', 1, 1, true],
    ['@@ -0,0 +1 @@\n+new\n', 1, 0, true],
    ['@@ -1 +0,0 @@\n-old\n', 0, 1, true],
    ['@@ -1,2 +1,2 @@\n keep\n-old\n+new\n\\ No newline at end of file\n', 1, 1, true],
    ['@@ -1 +1 @@\n-old\n', 1, 1, false],
    ['@@ -1 +1 @@\n-old\n+new\n+extra\n', 1, 1, false],
    ['@@ -1 +1 @@\n-old\n+new\n', 2, 1, false],
    ['Binary files differ', 0, 0, false],
    ['@@ -1 +1 @@\n-old\n@@ -2 +2 @@\n-a\n+b\n', 1, 1, false],
    ['@@ -1 +1 @@\nold\n+new\n', 1, 1, false],
    ['@@ -1 +1 @@\n same\n', 0, 0, true],
] as const)('verifies exact hunk completeness without trusting counters (%s)', (patch, additions, deletions, expected) => {
    expect(completeTextPatch(patch, additions, deletions)).toBe(expected);
});


it('rejects a valid-looking provider patch against a required nonregular Git object', async () => {
    const fixture = repository({ file: 'old\n' }, { file: 'target' });
    try {
        const blob = fixture.git('hash-object', '-w', 'file');
        fixture.git('update-index', '--cacheinfo', '120000', blob, 'file');
        fixture.git('commit', '-qm', 'nonregular');
        const identity = { ...fixture.pr(1), headSha: fixture.git('rev-parse', 'HEAD') };
        const patch = '@@ -1 +1 @@\n-old\n+target\n\\ No newline at end of file\n';
        await expect(fixture.read([change('file', 'modified', 1, 1, patch)], true, identity)).rejects.toBeInstanceOf(BugbotReviewCompletenessError);
    } finally { fixture.dispose(); }
});

it('recovers a provider patch with matching counts but different immutable content', async () => {
    const fixture = repository({ file: 'old\n' }, { file: 'new\n' });
    try {
        const patch = '@@ -1 +1 @@\n-old\n+wrong\n';
        expect(completeTextPatch(patch, 1, 1)).toBe(true);
        const source = await fixture.read([change('file', 'modified', 1, 1, patch)]);
        expect(source.changes[0]).toMatchObject({ source: 'local-git', patch: expect.stringContaining('+new') });
    } finally { fixture.dispose(); }
});

it('verifies a complete provider patch only after an independent complete Git inventory', async () => {
    const fixture = repository({ file: 'old\n' }, { file: 'new\n', omitted: 'missing native record\n' });
    try {
        const patch = '@@ -1 +1 @@\n-old\n+new\n';
        await expect(fixture.read([change('file', 'modified', 1, 1, patch)])).rejects.toMatchObject({ facts: { resource: 'coverage' } });
    } finally { fixture.dispose(); }
});

it('accepts a verified empty-file addition as metadata without fabricating text hunks', async () => {
    const fixture = repository({}, { file: '' });
    try {
        const source = await fixture.read([change('file', 'added', 0, 0)]);
        expect(source.changes[0].git?.current?.mode).toBe('100644');
        expect(JSON.parse(source.changes[0].patch).kind).toBe('verified-metadata-only');
    } finally { fixture.dispose(); }
});

it('preserves a UTF-8 BOM as immutable source content instead of losing it during decoding', async () => {
    const fixture = repository({ file: '\ufeffold\n' }, { file: '\ufeffnew\n' });
    try {
        const patch = '@@ -1 +1 @@\n-\ufeffold\n+\ufeffnew\n';
        const source = await fixture.read([change('file', 'modified', 1, 1, patch)]);
        expect(source.changes[0].source).toBe('provider');
        expect(source.changes[0].patch).toBe(patch);
        expect(source.metrics).toMatchObject({ verifiedBlobs: 2, verifiedBlobBytes: 14, recoveredFiles: 0 });
    } finally { fixture.dispose(); }
});

it('rejects an actually shallow local repository without fetching missing ancestors', async () => {
    const fixture = repository({ file: 'old\n' }, { file: 'new\n' });
    try {
        writeFileSync(join(fixture.root, '.git', 'shallow'), fixture.base + '\n');
        await expect(fixture.read([change('file')])).rejects.toMatchObject({ facts: { resource: 'source' } });
    } finally { fixture.dispose(); }
});

it.each([984, 985])('bounds actual immutable Git operations at the %s-rename edge', async count => {
    const oldFiles = Object.fromEntries(Array.from({ length: count }, (_, i) => [`old-${i}`, 'old\n']));
    const newFiles = Object.fromEntries(Array.from({ length: count }, (_, i) => [`new-${i}`, 'new\n']));
    const fixture = repository(oldFiles, newFiles);
    try {
        const changes = Array.from({ length: count }, (_, i) => ({ ...change(`new-${i}`, 'renamed', 1, 1,
            i === 0 ? '' : '@@ -1 +1 @@\n-old\n+new\n'), previousFilename: `old-${i}` }));
        if (count === 984) expect((await fixture.read(changes)).metrics!.gitReads).toBe(256);
        else await expect(fixture.read(changes)).rejects.toMatchObject({ facts: { resource: 'gitReads', observed: 257, limit: 256 } });
    } finally { fixture.dispose(); }
}, 120000);

it('verifies SHA-256 repositories and blob identities without assuming SHA-1 storage', async () => {
    const fixture = repository({ file: 'old\n' }, { file: 'new\n' }, 'sha256');
    try {
        const source = await fixture.read([change('file')]);
        expect(source.identity.headSha).toHaveLength(64);
        expect(source.changes[0].git!.current!.oid).toHaveLength(64);
    } finally { fixture.dispose(); }
});
it('projects an empty-file deletion with no current text side', async () => {
    const fixture = repository({ file: '' }, {});
    try {
        const source = await fixture.read([change('file', 'removed', 0, 0)]);
        expect(JSON.parse(source.changes[0].patch).current).toBeNull();
    } finally { fixture.dispose(); }
});
it('verifies inventory but does not read ignored blobs or resolve a nonexistent working root', async () => {
    const fixture = repository({ file: 'old\n' }, { file: 'new\n' });
    const snapshot = { changes: [change('file')], filesWithFirstDiffLine: [], filesWithDiffLocations: [] };
    try {
        const result = await new BugbotGitReviewSourceAdapter(fixture.root).readCompleteSource(fixture.pr(1), snapshot, true, ['**']);
        expect(result.metrics!.verifiedBlobs).toBe(0);
        await expect(new BugbotGitReviewSourceAdapter(join(fixture.root, 'absent')).readCompleteSource(fixture.pr(1), snapshot, true, []))
            .rejects.toMatchObject({ facts: { resource: 'source' } });
        await expect(fixture.read([change('file'), change('file')])).rejects.toMatchObject({ facts: { resource: 'coverage' } });
    } finally { fixture.dispose(); }
});

const wireFaults: Array<[string, (args: string[]) => boolean, (out: Buffer) => Buffer, string]> = [
    ['wrong working root', args => args.includes('--show-toplevel'), () => Buffer.from(tmpdir() + '\n'), 'identity'],
    ['wrong object format', args => args.includes('--show-object-format'), () => Buffer.from('invalid\n'), 'identity'],
    ['different verified commit', args => args.includes('--verify'), () => Buffer.from('f'.repeat(40) + '\n'), 'identity'],
    ['ambiguous merge-base', args => args.includes('merge-base'), out => Buffer.concat([out, out]), 'identity'],
    ['invalid merge-base identity', args => args.includes('merge-base'), () => Buffer.from('bad\n'), 'identity'],
    ['unterminated immutable inventory', args => args.includes('--raw'), out => out.subarray(0, -1), 'coverage'],
    ['incomplete raw record pair', args => args.includes('--raw'), () => Buffer.from('one\0'), 'coverage'],
    ['extra batch-size response', args => args.includes('--batch-check'), out => Buffer.concat([out, out]), 'source'],
    ['wrong batch-size object id', args => args.includes('--batch-check'), out => Buffer.from(out.toString().replace(/^[a-f0-9]+/u, 'f'.repeat(40))), 'source'],
    ['missing batch header delimiter', args => args.includes('--batch'), () => Buffer.from('incomplete'), 'source'],
    ['substituted batch header', args => args.includes('--batch'), out => Buffer.from('f' + out.subarray(1).toString()), 'source'],
    ['trailing unassigned batch bytes', args => args.includes('--batch'), out => Buffer.concat([out, Buffer.from('extra')]), 'source'],
];
it.each(wireFaults)('rejects %s from the trusted Git process boundary', async (_name, matches, corrupt, resource) => {
    const fixture = repository({ file: 'old\n' }, { file: 'new\n' });
    const execute = child.execFile;
    const spy = jest.spyOn(child, 'execFile').mockImplementation(((command: string, args: string[], options: any, callback: any) =>
        execute(command, args, options, (error, out, stderr) => callback(error, matches(args) ? corrupt(out as Buffer) : out, stderr))) as any);
    try { await expect(fixture.read([change('file')])).rejects.toMatchObject({ facts: { resource } }); }
    finally { spy.mockRestore(); fixture.dispose(); }
});
it.each(['stdout', 'stderr'])('reports only a proven stdout overflow as a recovered-patch lower bound: %s', async stream => {
    const fixture = repository({ file: 'old\n' }, { file: 'new\n' });
    const execute = child.execFile;
    const spy = jest.spyOn(child, 'execFile').mockImplementation(((command: string, args: string[], options: any, callback: any) =>
        execute(command, args, options, (error, out, stderr) => callback(args.includes('diff') && !args.includes('--raw')
            ? { code: 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER', message: `${stream} maxBuffer length exceeded` } : error, out, stderr))) as any);
    try {
        await expect(fixture.read([change('file')])).rejects.toMatchObject({ facts: stream === 'stdout'
            ? { resource: 'recoveredPatchBytes', observed: 2097153, limit: 2097152, countKind: 'at-least' } : { resource: 'source' } });
    } finally { spy.mockRestore(); fixture.dispose(); }
});
it('selects native Windows null-device arguments without inheriting a shell', async () => {
    const fixture = repository({ file: 'old\n' }, { file: 'new\n' });
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!;
    const execute = jest.spyOn(child, 'execFile');
    try {
        Object.defineProperty(process, 'platform', { ...platform, value: 'win32' });
        await fixture.read([change('file')]);
        expect((execute.mock.calls[0][2] as any).env.GIT_CONFIG_GLOBAL).toBe('NUL');
        expect(execute.mock.calls[0][1]).toContain('core.hooksPath=NUL');
    } finally { Object.defineProperty(process, 'platform', platform); execute.mockRestore(); fixture.dispose(); }
});

it('uses the current working root only when explicitly composed without an alternate root', async () => {
    const fixture = repository({ file: 'old\n' }, { file: 'new\n' });
    try {
        await expect(new BugbotGitReviewSourceAdapter().readCompleteSource({ ...fixture.pr(1), headSha: 'f'.repeat(40) },
            { changes: [change('file')], filesWithFirstDiffLine: [], filesWithDiffLocations: [] }, true, []))
            .rejects.toBeInstanceOf(BugbotReviewCompletenessError);
    } finally { fixture.dispose(); }
});


it.each([
    ['current oversized ASCII', 'filename', 'a'.repeat(12001)],
    ['previous oversized ASCII', 'previousFilename', 'a'.repeat(12001)],
    ['current UTF-8 one byte over', 'filename', 'é'.repeat(512) + 'a'],
    ['previous UTF-8 one byte over', 'previousFilename', 'é'.repeat(512) + 'a'],
] as const)('rejects %s before acquiring Git source', async (_name, field, path) => {
    const fixture = repository({ file: 'old\n' }, { file: 'new\n' });
    const execute = jest.spyOn(child, 'execFile');
    try {
        const record = { ...change('file'), status: 'renamed', previousFilename: 'old', [field]: path };
        await expect(fixture.read([record])).rejects.toMatchObject({ facts: { resource: 'source' } });
        expect(execute).not.toHaveBeenCalled();
    } finally { execute.mockRestore(); fixture.dispose(); }
});

it('consumes every maximum-length admitted path through bounded native tree batches', async () => {
    const directories = ['d'.repeat(200), 'e'.repeat(200), 'f'.repeat(200), 'g'.repeat(200)];
    const leaves = Array.from({ length: 12 }, (_, index) => String(index).padStart(2, '0') + 'n'.repeat(218));
    const paths = leaves.map(leaf => [...directories, leaf].join('/'));
    expect(paths.every(path => Buffer.byteLength(path) === 1024)).toBe(true);
    const fixture = repository({ file: 'old\n' }, { file: 'new\n' });
    const execute = jest.spyOn(child, 'execFile');
    try {
        // Git objects admit literal paths independently of the host's checkout path limit.
        const tree = (rows: string) => execFileSync('git', ['-C', fixture.root, 'mktree'], {
            encoding: 'utf8', input: rows,
            env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_'))),
        }).trim();
        const sourceTree = (blob: string) => {
            let oid = tree(leaves.map(leaf => `100644 blob ${blob}\t${leaf}\n`).join(''));
            for (const directory of [...directories].reverse()) oid = tree(`040000 tree ${oid}\t${directory}\n`);
            return oid;
        };
        const base = fixture.git('commit-tree', sourceTree(fixture.git('rev-parse', `${fixture.base}:file`)), '-p', fixture.base, '-m', 'long-path base');
        const head = fixture.git('commit-tree', sourceTree(fixture.git('rev-parse', `${fixture.head}:file`)), '-p', base, '-m', 'long-path head');
        const changes = paths.map(path => change(path, 'modified', 1, 1, '@@ -1 +1 @@\n-old\n+new\n'));
        const source = await fixture.read(changes, true, { ...fixture.pr(paths.length), baseSha: base, baseRefSha: base, headSha: head });
        expect(source.changes.map(item => item.filename)).toEqual(paths);
        const batches = execute.mock.calls.filter(call => (call[1] as string[]).includes('ls-tree'))
            .map(call => { const args = call[1] as string[]; return args.slice(args.lastIndexOf('--') + 1); });
        expect(batches.map(batch => batch.length)).toEqual([11, 1, 11, 1]);
        expect(batches.slice(0, 2).flat()).toEqual(paths);
        expect(batches.slice(2).flat()).toEqual(paths);
        expect(batches.every(batch => batch.length > 0 && batch.reduce((bytes, path) => bytes + Buffer.byteLength(path) + 1, 0) <= 12000)).toBe(true);
    } finally { execute.mockRestore(); fixture.dispose(); }
}, 30000);


it('verifies a copy as its own addition without consuming its unchanged previous path', async () => {
    const fixture = repository({ old: 'old\n' }, { old: 'old\n', current: 'old\n' });
    try {
        const source = await fixture.read([{ ...change('current', 'copied', 1, 0), previousFilename: 'old' }]);
        expect(source.complete).toBe(true);
        expect(source.changes).toHaveLength(1);
        expect(source.changes[0]).toMatchObject({ filename: 'current', previousFilename: 'old', status: 'copied' });
        expect(completeTextPatch(source.changes[0].patch, 1, 0)).toBe(true);
    } finally { fixture.dispose(); }
});

it.each(['modified', 'removed'] as const)('rejects a copy that omits its separately %s source before any blob reads', async status => {
    const fixture = repository({ old: 'old\n' }, { current: 'old\n', ...(status === 'modified' ? { old: 'new\n' } : {}) });
    const execute = jest.spyOn(child, 'execFile');
    try {
        const before = fixture.git('status', '--porcelain');
        await expect(fixture.read([{ ...change('current', 'copied', 1, 0), previousFilename: 'old' }]))
            .rejects.toMatchObject({ facts: { resource: 'coverage' } });
        expect(execute.mock.calls.some(call => (call[1] as string[]).includes('ls-tree'))).toBe(false);
        expect(execute.mock.calls.some(call => (call[1] as string[]).includes('cat-file'))).toBe(false);
        expect(fixture.git('status', '--porcelain')).toBe(before);
    } finally { execute.mockRestore(); fixture.dispose(); }
});

it.each(['modified', 'removed'] as const)('retains both native records when a copy source is separately %s', async status => {
    const fixture = repository({ old: 'old\n' }, { current: 'old\n', ...(status === 'modified' ? { old: 'new\n' } : {}) });
    try {
        const records = [{ ...change('current', 'copied', 1, 0), previousFilename: 'old' }, change('old', status, status === 'modified' ? 1 : 0, 1)];
        const source = await fixture.read(records);
        expect(source.complete).toBe(true);
        expect(source.changes.map(c => [c.filename, c.status])).toEqual([['current', 'copied'], ['old', status]]);
        for (const record of source.changes) expect(completeTextPatch(record.patch, record.additions, record.deletions)).toBe(true);
    } finally { fixture.dispose(); }
});

it.each(['modified', 'removed'] as const)('does not let an ignored copy hide its unassigned %s source', async status => {
    const fixture = repository({ old: 'old\n' }, { current: 'old\n', ...(status === 'modified' ? { old: 'new\n' } : {}) });
    try {
        const records = [{ ...change('current', 'copied', 1, 0), previousFilename: 'old' }];
        await expect(new BugbotGitReviewSourceAdapter(fixture.root).readCompleteSource(fixture.pr(1),
            { changes: records, filesWithFirstDiffLine: [], filesWithDiffLocations: [] }, true, ['current']))
            .rejects.toMatchObject({ facts: { resource: 'coverage' } });
    } finally { fixture.dispose(); }
});

it('permits multiple complete copy additions sharing one unchanged source without duplicate native ownership', async () => {
    const fixture = repository({ old: 'old\n' }, { old: 'old\n', first: 'old\n', second: 'old\n' });
    try {
        const source = await fixture.read(['first', 'second'].map(filename => ({ ...change(filename, 'copied', 1, 0), previousFilename: 'old' })));
        expect(source.complete).toBe(true);
        expect(source.changes.map(c => c.filename)).toEqual(['first', 'second']);
    } finally { fixture.dispose(); }
});

it('verifies all current-side content when optional copy-source metadata is absent', async () => {
    const fixture = repository({ old: 'old\n' }, { old: 'old\n', current: 'old\n' });
    try {
        const source = await fixture.read([change('current', 'copied', 1, 0)]);
        expect(source.complete).toBe(true);
        expect(completeTextPatch(source.changes[0].patch, 1, 0)).toBe(true);
    } finally { fixture.dispose(); }
});
