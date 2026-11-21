import { setupInstallationTreeLevel } from '../setup_installation_tree_policy';
import { setupInstallationFiles, SETUP_INSTALLATION_MANIFEST_PATH } from '../setup_installation_receipt_policy';
import type { SetupInstallationApprovedBlob, SetupInstallationTree, SetupInstallationTreeEntry } from '../../contracts/setup_installation_delivery';
import { assertSetupPublisherOptions, parseSetupPublisherOperation, parseSetupPublisherProposal, setupPublisherWorkflow } from '../setup_publisher_installation_policy';
import { SETUP_PUBLISHER_WORKFLOW_PATH } from '../../../domain/setup_publisher_installation';

const oldSha = '1'.repeat(40), newSha = '2'.repeat(40), otherSha = '3'.repeat(40);
const entry = (path: string, sha = oldSha, mode = '100644', type: SetupInstallationTreeEntry['type'] = 'blob') => ({ path, sha, mode, type });
const tree = (...entries: SetupInstallationTreeEntry[]): SetupInstallationTree => ({ entries, truncated: false });
const approved: readonly SetupInstallationApprovedBlob[] = [{ path: '.github/workflows/publisher.yml', sha: newSha, mode: '100644' }];
const empty = tree();
const receipt = { schemaVersion: 1 as const, operationId: '12345678-1234-4234-8234-123456789abc',
  repositoryId: 42, baseSha: oldSha, planDigest: '4'.repeat(64) };

describe('complete approved Setup file scope', () => {
  it('requests only approved ancestors and preserves arbitrary unrelated sibling names and modes', () => {
    const unrelated = entry('documentación #1.txt', otherSha, '100755');
    expect(setupInstallationTreeLevel('', tree(unrelated, entry('.github', oldSha, '040000', 'tree')),
      tree(unrelated, entry('.github', newSha, '040000', 'tree')), approved))
      .toEqual([{ path: '.github', baseSha: oldSha, preparedSha: newSha }]);
  });
  it('follows a newly created ancestor to exact approved leaves', () => {
    expect(setupInstallationTreeLevel('', empty, tree(entry('.github', newSha, '040000', 'tree')), approved))
      .toEqual([{ path: '.github', preparedSha: newSha }]);
    expect(setupInstallationTreeLevel('.github/workflows', empty, tree(entry('publisher.yml', newSha)), approved)).toEqual([]);
  });
  it('accepts the exact approved leaf replacement and no other change', () => {
    expect(setupInstallationTreeLevel('.github/workflows', tree(entry('publisher.yml')), tree(entry('publisher.yml', newSha)), approved)).toEqual([]);
  });
  it('descends through a removed ancestor to prove all of its removed leaves were approved', () => {
    const deletion = [{ path: '.github/old.yml', sha: null, mode: '100644' as const }];
    expect(setupInstallationTreeLevel('', tree(entry('.github', oldSha, '040000', 'tree')), empty, deletion))
      .toEqual([{ path: '.github', baseSha: oldSha }]);
    expect(setupInstallationTreeLevel('.github', tree(entry('old.yml')), empty, deletion)).toEqual([]);
    expect(() => setupInstallationTreeLevel('.github', tree(entry('old.yml'), entry('human.yml')), empty, deletion)).toThrow();
  });
  it.each([
    ['added sibling', empty, tree(entry('human.txt'))],
    ['removed sibling', tree(entry('human.txt')), empty],
    ['changed sibling', tree(entry('human.txt')), tree(entry('human.txt', newSha))],
    ['changed sibling mode', tree(entry('human.txt')), tree(entry('human.txt', oldSha, '100755'))],
    ['changed unrelated subtree', tree(entry('source', oldSha, '040000', 'tree')), tree(entry('source', newSha, '040000', 'tree'))],
  ])('rejects an %s even if expected workflow and receipt blobs would match', (_reason, base, prepared) => {
    expect(() => setupInstallationTreeLevel('', base as SetupInstallationTree, prepared as SetupInstallationTree, approved)).toThrow();
  });
  it.each([
    ['missing', empty], ['wrong bytes', tree(entry('publisher.yml', otherSha))],
    ['executable', tree(entry('publisher.yml', newSha, '100755'))],
    ['symlink', tree(entry('publisher.yml', newSha, '120000'))],
    ['tree', tree(entry('publisher.yml', newSha, '040000', 'tree'))],
  ])('rejects a %s approved leaf', (_reason, prepared) => {
    expect(() => setupInstallationTreeLevel('.github/workflows', empty, prepared as SetupInstallationTree, approved)).toThrow();
  });
  it('rejects a purported deletion when that leaf remains', () => {
    expect(() => setupInstallationTreeLevel('', tree(entry('old.yml')), tree(entry('old.yml')),
      [{ path: 'old.yml', sha: null, mode: '100644' }])).toThrow();
  });
  it.each(['120000'])('does not replace a nonregular baseline leaf with mode %s', mode => {
    expect(() => setupInstallationTreeLevel('.github/workflows', tree(entry('publisher.yml', oldSha, mode)),
      tree(entry('publisher.yml', newSha)), approved)).toThrow();
  });
  it('preserves legacy approval of replacing or deleting a regular executable asset', () => {
    expect(setupInstallationTreeLevel('.github/workflows', tree(entry('publisher.yml', oldSha, '100755')),
      tree(entry('publisher.yml', newSha)), approved)).toEqual([]);
    expect(setupInstallationTreeLevel('', tree(entry('old.yml', oldSha, '100755')), empty,
      [{ path: 'old.yml', sha: null, mode: '100644' }])).toEqual([]);
  });
  it.each(['base', 'prepared'])('rejects a non-tree %s ancestor', side => {
    const blob = tree(entry('.github')), directory = tree(entry('.github', newSha, '040000', 'tree'));
    expect(() => setupInstallationTreeLevel('', side === 'base' ? blob : empty, side === 'prepared' ? blob : directory, approved)).toThrow();
  });
  it.each(['base', 'prepared'])('rejects a truncated %s tree rather than assuming absence', side => {
    expect(() => setupInstallationTreeLevel('', { ...empty, truncated: side === 'base' },
      { ...empty, truncated: side === 'prepared' }, approved)).toThrow();
  });
  it.each([
    ['duplicate names', [entry('same'), entry('same')]], ['nested path', [entry('a/b')]],
    ['empty name', [entry('')]], ['dot', [entry('.')]], ['parent', [entry('..')]], ['NUL', [entry('a\0b')]],
    ['bad object ID', [entry('a', 'bad')]], ['unknown mode', [entry('a', oldSha, 'invalid')]],
    ['mode/type mismatch', [entry('a', oldSha, '040000', 'blob')]],
  ])('rejects malformed provider entries: %s', (_reason, entries) => {
    expect(() => setupInstallationTreeLevel('', tree(...entries as SetupInstallationTreeEntry[]), empty, approved)).toThrow();
  });
  it.each(['../escape', '/absolute', 'a//b', 'a/./b', 'a/../b', 'a b', 'x'.repeat(241), ''])('rejects unsafe approved path %s', path => {
    expect(() => setupInstallationTreeLevel('', empty, empty, [{ path, sha: newSha, mode: '100644' }])).toThrow();
  });
  it('rejects a duplicate approved leaf or a leaf overlapping an approved ancestor', () => {
    expect(() => setupInstallationTreeLevel('', empty, empty, [...approved, ...approved])).toThrow();
    expect(() => setupInstallationTreeLevel('', empty, empty, [...approved, { path: '.github', sha: newSha, mode: '100644' }])).toThrow();
  });
  it('rejects unapproved prefixes and invalid approval mode or digest', () => {
    for (const prefix of ['../foreign', 'elsewhere']) expect(() => setupInstallationTreeLevel(prefix, empty, empty, approved)).toThrow();
    expect(() => setupInstallationTreeLevel('', empty, empty, [])).toThrow();
    expect(() => setupInstallationTreeLevel('', empty, empty, [{ path: 'file', sha: 'wrong', mode: '100644' }])).toThrow();
    expect(() => setupInstallationTreeLevel('', empty, empty, [{ path: 'file', sha: newSha, mode: '100755' as '100644' }])).toThrow();
  });
});

describe('shared installation receipt formatting', () => {
  it('preserves existing metadata and replaces only the nested receipt in final approved files', () => {
    const manifest = { schemaVersion: 2, generator: { name: '@vypdev/copilot', contractVersion: 1 }, artifacts: { source: 'unchanged' }, installation: { old: true } };
    const result = setupInstallationFiles([{ path: 'workflow.yml', content: 'exact\n' },
      { path: SETUP_INSTALLATION_MANIFEST_PATH, content: 'old' }], manifest, receipt);
    expect(result).toEqual([{ path: 'workflow.yml', content: 'exact\n' }, {
      path: SETUP_INSTALLATION_MANIFEST_PATH, content: JSON.stringify({ ...manifest, installation: receipt }, null, 2) + '\n',
    }]);
    expect(manifest.installation).toEqual({ old: true });
    expect(setupInstallationFiles([], manifest, receipt)).toEqual([result[1]]);
  });
  it.each([null, false, 'text', []])('rejects an unsupported manifest %j', manifest => {
    expect(() => setupInstallationFiles([], manifest, receipt)).toThrow();
  });
  it('rejects an unsupported receipt without rendering it', () => {
    expect(() => setupInstallationFiles([], {}, { ...receipt, schemaVersion: 2 as 1 })).toThrow();
  });
});

function proposal(): Record<string, unknown> {
  return { schemaVersion: 1, kind: 'review-only-publisher-installation-proposal',
    destination: { repository: 'vypdev/copilot', repositoryId: 891781467, defaultBranch: 'master', head: oldSha },
    path: SETUP_PUBLISHER_WORKFLOW_PATH, baseline: 'absent with authenticated readable parent',
    source: { repository: 'vypdev/copilot', commit: newSha, pullRequest: 989, merged: false, maintainerApproval: 'pending',
      workflowSha256: 'a'.repeat(64), actionManifestSha256: 'b'.repeat(64), actionBundleSha256: 'c'.repeat(64) },
    proposedWorkflowSha256: 'd'.repeat(64), sourceChange: 'replace one local Action invocation', consumerTemplatesChanged: false,
    productionVerification: 'disabled', installationAuthorized: false, installedDestinationSha: null,
    nativeCanary: { status: 'not-run', explicitlyAuthorizedPullRequest: null, runId: null }, dependency: 976, coordination: 814 };
}

describe('closed publisher input and option policy', () => {
  it('copies a valid proposal without converting its observations into authority', () => {
    const input = proposal(), parsed = parseSetupPublisherProposal(input);
    expect(parsed).toEqual(input); expect(parsed).not.toBe(input);
    expect(parsed.installationAuthorized).toBe(false);
    expect(parseSetupPublisherProposal({ ...input, source: { ...input.source as object, merged: true } }).source.merged).toBe(true);
  });
  it.each([null, false, [], 'proposal', { ...proposal(), secret: 'do-not-print' }])('rejects a malformed top-level proposal %j', value => {
    expect(() => parseSetupPublisherProposal(value)).toThrow('invalid or unsupported');
  });
  it.each([
    ['schemaVersion', 2], ['kind', 'completed'], ['path', '../elsewhere.yml'], ['baseline', null], ['sourceChange', ''],
    ['sourceChange', 'x'.repeat(513)], ['baseline', 'unsafe\x1btext'], ['proposedWorkflowSha256', 'short'],
    ['consumerTemplatesChanged', true], ['productionVerification', 'enabled'], ['installationAuthorized', true],
    ['installedDestinationSha', oldSha], ['dependency', 975], ['coordination', 815],
  ])('rejects unsupported proposal field %s', (key, value) => {
    expect(() => parseSetupPublisherProposal({ ...proposal(), [key]: value })).toThrow();
  });
  it.each([
    ['destination', null], ['source', []], ['nativeCanary', false],
    ['destination', { ...proposal().destination as object, unexpected: true }],
    ['source', { ...proposal().source as object, token: 'must-not-echo' }],
    ['nativeCanary', { ...proposal().nativeCanary as object, result: 'forged' }],
  ])('rejects nonclosed nested %s', (key, value) => {
    expect(() => parseSetupPublisherProposal({ ...proposal(), [key]: value })).toThrow();
  });
  it.each([
    ['repository', 'https://github.com/vypdev/copilot'], ['repository', 12],
    ['repositoryId', '891781467'], ['repositoryId', 0], ['repositoryId', Number.MAX_SAFE_INTEGER + 1],
    ['head', 'short'], ['defaultBranch', false], ['defaultBranch', ''], ['defaultBranch', 'x'.repeat(201)],
    ['defaultBranch', '@'], ['defaultBranch', 'refs]bad'], ['defaultBranch', '/bad'], ['defaultBranch', 'bad.'],
    ['defaultBranch', 'bad..name'], ['defaultBranch', 'a//b'], ['defaultBranch', 'a/.hidden'], ['defaultBranch', 'a/b.lock'],
  ])('rejects an invalid destination %s', (key, value) => {
    expect(() => parseSetupPublisherProposal({ ...proposal(), destination: { ...proposal().destination as object, [key]: value } })).toThrow();
  });
  it.each([
    ['repository', 'foreign/action'], ['commit', false], ['pullRequest', -1], ['merged', 'true'],
    ['maintainerApproval', ''], ['workflowSha256', null], ['actionManifestSha256', 'short'], ['actionBundleSha256', 42],
  ])('rejects an invalid source %s', (key, value) => {
    expect(() => parseSetupPublisherProposal({ ...proposal(), source: { ...proposal().source as object, [key]: value } })).toThrow();
  });
  it.each([['status', 'passed'], ['explicitlyAuthorizedPullRequest', 951], ['runId', 42]])('rejects an invented completed canary %s', (key, value) => {
    expect(() => parseSetupPublisherProposal({ ...proposal(), nativeCanary: { ...proposal().nativeCanary as object, [key]: value } })).toThrow();
  });
  it('transforms exactly one root-local invocation and retains LF and CRLF source bytes', () => {
    for (const newline of ['\n', '\r\n']) {
      const source = ['name: fixed', 'steps:', '  - uses: actions/checkout@v5', '  - name: Publish canonical comment', '    uses: ./', '    with:', '      token: fixed', ''].join(newline);
      expect(setupPublisherWorkflow(source, newSha)).toBe(source.replace('uses: ./', `uses: vypdev/copilot@${newSha}`));
    }
  });
  it.each(['name: no local step\n', '    uses: ./\n    uses: ./\n', '    uses: ./other\n', '    uses: ./ #custom\n'])('rejects a foreign source layout %j', source => {
    expect(() => setupPublisherWorkflow(source, newSha)).toThrow();
  });
  it('rejects a short source pin before transforming any bytes', () => {
    expect(() => setupPublisherWorkflow('    uses: ./\n', 'main')).toThrow();
  });
  it('admits only explicit publisher options and never interprets parsed false as omission', () => {
    expect(() => assertSetupPublisherOptions(['publisherManifest', 'token', 'debug', 'dryRun', 'resumeOperation'])).not.toThrow();
    expect(() => assertSetupPublisherOptions([])).toThrow();
    for (const flag of ['yes', 'nonInteractive', 'web', 'batch', 'config', 'secret', 'skipVariables', 'updateWorkflows']) {
      expect(() => assertSetupPublisherOptions(['publisherManifest', flag])).toThrow();
    }
  });
});

function operation(): Record<string, unknown> {
  return { schemaVersion: 2, purpose: 'bugbot-status-publisher', operationId: receipt.operationId, repositoryId: 42,
    repository: 'vypdev/copilot', defaultBranch: 'master', baseSha: oldSha, sourceCommit: newSha,
    planDigest: 'a'.repeat(64), approvalDigest: 'b'.repeat(64), actorId: 7, status: 'ready', effects: [] };
}
const finished = () => ({ ...operation(), status: 'waiting-for-merge', effects: ['tree', 'commit', 'branch', 'pull-request'],
  preparedTree: otherSha, preparedCommit: newSha, pullRequestNumber: 123 });

describe('purpose-bound publisher recovery metadata', () => {
  it('retains private metadata and exact known effects without claiming installation or native verification', () => {
    expect(parseSetupPublisherOperation(operation())).toEqual(operation());
    expect(parseSetupPublisherOperation(finished())).toEqual(finished());
    const pending = { ...operation(), status: 'partial', effects: ['tree'], preparedTree: otherSha, uncertain: 'commit' };
    expect(parseSetupPublisherOperation(pending)).toEqual(pending);
    expect(parseSetupPublisherOperation({ ...operation(), status: 'applying', uncertain: 'tree' }).uncertain).toBe('tree');
  });
  it.each([null, false, [], 'legacy', { ...operation(), resource: 'secret' }])('rejects nonclosed recovery data %j', value => {
    expect(() => parseSetupPublisherOperation(value)).toThrow();
  });
  it.each([
    ['schemaVersion', 1], ['purpose', 'generic-setup'], ['operationId', 1], ['operationId', '../foreign'],
    ['repositoryId', 0], ['repository', 'https://github.com/vypdev/copilot'], ['defaultBranch', 'bad..branch'],
    ['baseSha', 'main'], ['sourceCommit', null], ['planDigest', 'old'], ['approvalDigest', 'unapproved'],
    ['actorId', 0], ['status', 'native-verified'], ['effects', null], ['effects', ['access']],
    ['effects', ['tree', 'commit', 'branch', 'pull-request', 'extra']],
    ['preparedTree', 'invalid'], ['preparedCommit', 'invalid'], ['pullRequestNumber', 0],
    ['preparedTree', otherSha], ['preparedCommit', newSha], ['pullRequestNumber', 12],
    ['uncertain', 'commit'], ['status', 'waiting-for-merge'],
  ])('rejects incompatible journal field %s', (key, value) => {
    expect(() => parseSetupPublisherOperation({ ...operation(), [key]: value })).toThrow();
  });
  it.each(['preparedTree', 'preparedCommit', 'pullRequestNumber'])('rejects a completed effect lacking its %s', key => {
    const value: Record<string, unknown> = finished(); delete value[key];
    expect(() => parseSetupPublisherOperation(value)).toThrow();
  });
  it('does not permit uncertainty to coexist with a completed effect or a nonpending state', () => {
    expect(() => parseSetupPublisherOperation({ ...operation(), uncertain: 'tree' })).toThrow();
    expect(() => parseSetupPublisherOperation({ ...finished(), status: 'partial', uncertain: 'pull-request' })).toThrow();
  });
});
