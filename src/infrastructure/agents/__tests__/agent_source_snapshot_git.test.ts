const childProcess = require('node:child_process') as typeof import('node:child_process');
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SourceSnapshotGit, gitBlobId } from '../agent_source_snapshot_git';
import { SddSourceContextFailure } from '../../../domain/agent_source_snapshot';
import { AgentCliError } from '../../../data/repository/agent_cli_contracts';
import { SOURCE_SNAPSHOT_LIMITS as LIMIT } from '../../../application/policies/agent_source_snapshot_policy';

const source = { kind: 'pre-branch-sdd', phase: 'analysis', baseSha: 'a'.repeat(40) } as const;
let runtime: string;
beforeEach(() => { runtime = mkdtempSync(join(tmpdir(), 'copilot-source-git-fault-')); });
afterEach(() => { jest.restoreAllMocks(); rmSync(runtime, { recursive: true, force: true }); });
const make = (deadline = performance.now() + 30_000, signal?: AbortSignal) => new SourceSnapshotGit(source, runtime, deadline, signal);
it.each(['linux', 'win32'] as const)('retains only fixed system keys from the %s environment on every host', observedPlatform => {
    const platform = process.platform, environment = process.env;
    const spy = jest.spyOn(childProcess, 'execFileSync').mockReturnValue(Buffer.from('git version fixture\n'));
    try {
        Object.defineProperty(process, 'platform', { value: observedPlatform });
        process.env = observedPlatform === 'win32'
            ? { Path: 'native-tools', SystemRoot: 'native-system', ComSpec: 'native-shell', GITHUB_TOKEN: 'private-token', GIT_SSH_COMMAND: 'unsafe' }
            : { PATH: 'native-tools', SYSTEMROOT: 'native-system', COMSPEC: 'native-shell', GITHUB_TOKEN: 'private-token', GIT_SSH_COMMAND: 'unsafe' };
        make();
        const options = spy.mock.calls[0][2] as { env: NodeJS.ProcessEnv };
        expect(options.env).toMatchObject({ PATH: 'native-tools', SYSTEMROOT: 'native-system', COMSPEC: 'native-shell', GIT_NO_LAZY_FETCH: '1' });
        expect(options.env).not.toHaveProperty('GITHUB_TOKEN'); expect(options.env).not.toHaveProperty('GIT_SSH_COMMAND');
    } finally { process.env = environment; Object.defineProperty(process, 'platform', { value: platform }); }
});
it('source-context-C38: an already cancelled preparation never invokes Git', () => {
    const spy = jest.spyOn(childProcess, 'execFileSync'), controller = new AbortController(); controller.abort();
    expect(() => make(undefined, controller.signal)).toThrow(expect.objectContaining({ category: 'cancelled' })); expect(spy).not.toHaveBeenCalled();
});
it('source-context-C38: an expired preparation never invokes Git', () => {
    const spy = jest.spyOn(childProcess, 'execFileSync'); expect(() => make(performance.now() - 1)).toThrow(expect.objectContaining({ category: 'timeout' })); expect(spy).not.toHaveBeenCalled();
});
it.each([['ETIMEDOUT', 'timeout'], ['ENOBUFS', 'metadata-limit'], ['EIO', 'object-unavailable']] as const)(
    'source-context-C27/source-context-C37/source-context-C38: %s becomes only its closed %s category', (code, expected) => {
        const git = make(); jest.spyOn(childProcess, 'execFileSync').mockImplementation(() => { throw Object.assign(new Error('PRIVATE_TOKEN /private/path secret stderr'), { code }); });
        try { git.run(runtime, ['cat-file', '-e', source.baseSha]); throw new Error('Expected rejection'); }
        catch (error) {
            expect(error).toBeInstanceOf(code === 'ETIMEDOUT' ? AgentCliError : SddSourceContextFailure);
            expect(error).toMatchObject(code === 'ETIMEDOUT' ? { category: expected } : { reason: expected });
            expect(String(error)).not.toMatch(/PRIVATE_TOKEN|private\/path|stderr/);
        }
    });
it('source-context-C37: unsupported no-lazy-fetch Git fails before consumer object access', () => {
    const spy = jest.spyOn(childProcess, 'execFileSync').mockImplementation(() => { throw new Error('unknown option: --no-lazy-fetch PRIVATE'); });
    expect(() => make()).toThrow(expect.objectContaining({ reason: 'git-unavailable' })); expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toContain('--version'); expect(spy.mock.calls[0][1]).toContain('--no-lazy-fetch');
});
it('source-context-C37: materialization failures discard private Git stderr', () => {
    const git = make(); jest.spyOn(childProcess, 'execFileSync').mockImplementation(() => { throw new Error('private remote URL'); });
    expect(() => git.run(runtime, ['init'], undefined, 1024, 'materialization-failed')).toThrow(expect.objectContaining({ reason: 'materialization-failed' }));
});
it('source-context-C22: selected object must be a commit', () => {
    const git = make(); jest.spyOn(git, 'run').mockReturnValue(Buffer.from('blob\n'));
    expect(() => git.inventory(runtime)).toThrow(expect.objectContaining({ reason: 'object-unavailable' }));
});
it.each(['0', '-1', 'bad', String(LIMIT.commitBytes + 1)])('source-context-C27: invalid or oversized commit metadata %s rejects', value => {
    const git = make(); jest.spyOn(git, 'run').mockReturnValueOnce(Buffer.from('commit\n')).mockReturnValueOnce(Buffer.from(value));
    expect(() => git.inventory(runtime)).toThrow(expect.objectContaining({ reason: 'metadata-limit' }));
});
it.each(['missing-header', 'wrong-id', 'short-body', 'missing-newline', 'wrong-digest', 'trailer'] as const)(
    'source-context-C22: rejects malformed raw batch protocol %s', variant => {
        const git = make(), bytes = Buffer.from('ok'), id = gitBlobId(bytes);
        const header = `${id} blob 2\n`, valid = Buffer.concat([Buffer.from(header), bytes, Buffer.from('\n')]);
        const output = variant === 'missing-header' ? Buffer.from('missing') : variant === 'wrong-id' ? Buffer.from(`wrong blob 2\nok\n`)
            : variant === 'short-body' ? Buffer.from(header) : variant === 'missing-newline' ? Buffer.concat([Buffer.from(header), bytes])
            : variant === 'wrong-digest' ? Buffer.from(`${header}no\n`) : Buffer.concat([valid, Buffer.from('trailer')]);
        jest.spyOn(git, 'run').mockReturnValue(output);
        expect(() => git.blobs(runtime, [{ path: 'a', objectId: id, mode: '100644', bytes: 2 }])).toThrow(expect.objectContaining({ reason: 'object-unavailable' }));
    });
it('source-context-C22: accepts a truly empty blob collection with no fabricated bytes', () => {
    const git = make(); jest.spyOn(git, 'run').mockReturnValue(Buffer.alloc(0)); expect(git.blobs(runtime, [])).toEqual(new Map());
});
