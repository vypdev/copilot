import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { createInstalledOfficialReader } = require('../shadow/installed_official.cjs');
const { makeBroker } = require('../shadow/broker.cjs');

const integrity = 'sha512-HCrVhHr5QQuwYoswEUGTb7gGp522yflbv/ST8nF4sFWGuLjQCt17Q/EubpGGSNKYn1tsTCPZxqHhHCfVURu7UA==';
const other = 'b'.repeat(40);
const anchor = { path: 'frontend/src/view.ts', line: 1, end: 1 };
const basis = { op: 'official', revision: 'head', target: 'playwright', version: null,
    basis: null, first: null, last: null, scope: null, query: 'toBeEnabled', why: 'Find the matcher behavior.' };
let repo: string;
let sha: string;
const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();

beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), 'bugbot-official-release-'));
    git('init', '-q');
    mkdirSync(join(repo, 'frontend/src'), { recursive: true });
    mkdirSync(join(repo, 'unrelated'), { recursive: true });
    writeFileSync(join(repo, 'frontend/src/view.ts'), 'const test = true;\n');
    writeFileSync(join(repo, 'frontend/package.json'), '{"devDependencies":{"playwright":"^1.64.0"}}');
    writeFileSync(join(repo, 'unrelated/package.json'), '{"devDependencies":{"playwright":"1.65.0"}}');
    writeFileSync(join(repo, 'pnpm-lock.yaml'), `lockfileVersion: "9.0"
importers:
  frontend:
    devDependencies:
      playwright: {specifier: ^1.64.0, version: 1.64.1}
  unrelated:
    devDependencies:
      playwright: {specifier: 1.65.0, version: 1.65.0}
packages:
  playwright@1.64.1:
    resolution: {integrity: ${integrity}}
  playwright@1.65.0:
    resolution: {integrity: sha512-fixture}
`);
    git('add', '.');
    git('-c', 'user.email=fixture@example.invalid', '-c', 'user.name=Fixture', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture');
    sha = git('rev-parse', 'HEAD');
});
afterAll(() => rmSync(repo, { recursive: true, force: true }));

it('proves the anchored importer version and rejects another importer or an incompatible delivered basis', () => {
    const reader = createInstalledOfficialReader();
    const input = { repo, sha, anchor, request: basis, packageName: 'playwright' };
    expect(reader.resolveVersion(input)).toMatchObject({ version: '1.64.1', lockfile: 'pnpm-lock.yaml',
        lockBlob: git('rev-parse', 'HEAD:pnpm-lock.yaml'), versionScope: 'pinned pnpm importer frontend' });
    expect(reader.resolveVersion({ ...input, request: { ...basis, version: '1.65.0' } })).toBeUndefined();
    expect(reader.resolveVersion({ ...input, request: { ...basis, basis: 'wrong' },
        proof: { kind: 'git', path: 'pnpm-lock.yaml', blob: other } })).toBeUndefined();
    expect(reader.resolveVersion({ ...input, anchor: { ...anchor, path: 'unrelated/src/view.ts' } })).toMatchObject({ version: '1.65.0' });
    expect(reader.resolveVersion({ ...input, packageName: 'sqlite' })).toBeUndefined();
    expect(reader.resolveVersion({ ...input, packageName: 'sqlite', request: { ...basis, basis: 'runtime' },
        proof: { kind: 'runtime', package: 'sqlite', version: '3.53.3', versionScope: 'local only' } })).toMatchObject({
        version: '3.53.3', versionScope: 'local only',
    });
});

it('only fetches reviewed public release origins and rejects altered source bytes', async () => {
    const fetchSource = jest.fn().mockResolvedValue(new Response('untrusted body'));
    const reader = createInstalledOfficialReader(fetchSource);
    await expect(reader.sources('playwright', '1.65.0')).resolves.toEqual([]);
    await expect(reader.sources('https://other.invalid', '1.64.1')).resolves.toEqual([]);
    expect(fetchSource).not.toHaveBeenCalled();
    await expect(reader.sources('playwright', '1.64.1')).rejects.toThrow('official-source-hash');
    expect(fetchSource).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/raw\.githubusercontent\.com\/microsoft\/playwright\/[0-9a-f]{40}\//u),
        expect.objectContaining({ redirect: 'error', credentials: 'omit' }));
});

it('keeps async source outcomes distinct and binds receipts from both adapters to this operation', async () => {
    const upstream = { lines: ['function toBeEnabled() {}'], url: 'https://github.com/microsoft/playwright',
        sourceKind: 'release-source', sha256: 'a'.repeat(64) };
    const sourceReader = createInstalledOfficialReader();
    const installedOfficial = { ...sourceReader, sources: jest.fn().mockResolvedValue([upstream]) };
    const readCi = jest.fn().mockResolvedValue({ status: 'ci-observed', runId: 12, attempt: 2, jobId: 44, stepNumber: 4,
        lines: ['Step 4 completed with conclusion skipped.'], url: 'https://github.com/owner/repo/actions/runs/12' });
    const source = { repo, installedOfficial, readCi, pullRequest: 17 };
    const subject = { repository: 'owner/repo', head: sha, base: sha, tree: git('rev-parse', 'HEAD^{tree}') };
    const finding = { id: 'candidate', detectorLocation: anchor, allowBase: false };
    const broker = makeBroker(source, subject, finding);
    const fresh = makeBroker(source, subject, finding);
    const result = await broker.inspect(basis);
    const [official] = result.sources;
    expect(result).toMatchObject({ status: 'provided', version: '1.64.1' });
    expect(broker.cite({ receipt: official.receipt, first: 1, last: 1 })).toMatchObject({ kind: 'official', sha, version: '1.64.1' });
    expect(() => fresh.cite({ receipt: official.receipt, first: 1, last: 1 })).toThrow('citation-unavailable-or-out-of-range');
    await expect(broker.inspect({ ...basis, query: 'unrelated symbol' })).resolves.toMatchObject({ status: 'official-no-match' });
    await expect(broker.inspect({ ...basis, version: '1.65.0' })).resolves.toMatchObject({ status: 'official-version-not-proven' });
    installedOfficial.sources.mockResolvedValueOnce([]);
    await expect(broker.inspect(basis)).resolves.toMatchObject({ status: 'official-source-unavailable' });
    const ci = { ...basis, op: 'ci', target: 'CI', scope: 'tests', query: 'Browser suite' };
    const [observation] = (await broker.inspect(ci)).sources;
    expect(readCi).toHaveBeenCalledWith({ sha, workflow: 'CI', job: 'tests', step: 'Browser suite',
        revision: 'head', pullRequest: 17 }, undefined);
    expect(broker.cite({ receipt: observation.receipt, first: 1, last: 1 })).toMatchObject({ kind: 'ci', sha, runId: 12, attempt: 2 });
    expect(broker.inspect({ ...ci, revision: 'base' })).toEqual({ status: 'base-denied' });
});
