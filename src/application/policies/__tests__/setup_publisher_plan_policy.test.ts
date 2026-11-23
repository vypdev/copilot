import { createHash } from 'node:crypto';
import type { SetupBatchFile } from '../../../domain/setup_batch';
import { SETUP_PUBLISHER_WORKFLOW_PATH, type SetupPublisherInspection, type SetupPublisherProposal } from '../../../domain/setup_publisher_installation';
import { createDefaultSetupConfiguration } from '../setup_configuration_defaults';
import { renderRepositoryAgentArtifacts, renderRepositoryAgentPointerBlock, REPOSITORY_AGENT_GUIDE_PATH,
  REPOSITORY_AGENT_POINTER_PATH, REPOSITORY_AGENT_POINTER_START, REPOSITORY_AGENT_POINTER_END,
  REPOSITORY_AGENT_PROFILE_PATH, type ManagedRole } from '../repository_agent_guidance_policy';
import { SETUP_INSTALLATION_MANIFEST_PATH } from '../setup_installation_receipt_policy';
import { planSetupPublisherInstallation, setupPublisherApprovalMatches, SetupPublisherPlanError } from '../setup_publisher_plan_policy';

type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const operation = '12345678-1234-4234-8234-123456789abc';
const base = '1'.repeat(40), sourceCommit = '2'.repeat(40);

function fixture() {
  const artifacts = renderRepositoryAgentArtifacts(createDefaultSetupConfiguration());
  const block = renderRepositoryAgentPointerBlock();
  const records: Record<string, { role: ManagedRole; sha256: string }> = Object.fromEntries(artifacts.map(a =>
    [a.path, { role: a.role, sha256: hash(a.content) }]));
  records[REPOSITORY_AGENT_POINTER_PATH] = { role: 'pointer', sha256: hash(block) };
  const manifest = { schemaVersion: 2, generator: { name: '@vypdev/copilot', contractVersion: 1 },
    profileDigest: records[REPOSITORY_AGENT_PROFILE_PATH].sha256, artifacts: records,
    installation: { schemaVersion: 1, operationId: '11111111-1111-4111-8111-111111111111', repositoryId: 42,
      baseSha: '3'.repeat(40), planDigest: '4'.repeat(64) } };
  const workflow = 'name: Publisher\non: workflow_run\njobs:\n  publish:\n    steps:\n      - name: Publish\n        uses: ./\n        with:\n          single-action: publish_bugbot_status_card_action\n';
  const inspection: Mutable<SetupPublisherInspection> = {
    target: { id: 42, ownerId: 9, owner: 'owner', name: 'project', defaultBranch: 'main', baseSha: base,
      private: true, archived: false, disabled: false, canPush: true },
    authority: { actorId: 7, repositoryId: 42, contents: 'write', pullRequests: 'write', workflows: 'write' },
    source: { repository: 'vypdev/copilot', repositoryId: 891781467, commit: sourceCommit, pullRequest: 989,
      reviewedRevision: sourceCommit, mergedRevision: sourceCommit, workflow,
      actionManifestSha256: 'a'.repeat(64), actionBundleSha256: 'b'.repeat(64) },
    installation: { complete: true, manifest: { path: SETUP_INSTALLATION_MANIFEST_PATH, mode: '100644', content: JSON.stringify(manifest) },
      guidance: [...artifacts.map(a => ({ path: a.path, mode: '100644', content: a.content })),
        { path: REPOSITORY_AGENT_POINTER_PATH, mode: '100644', content: `Human instructions\n${block}\nMore human instructions\n` }],
      workflows: [{ path: '.github/workflows/ci.yml', mode: '100644', content: 'name: CI\non: push\n' }],
      publisher: { kind: 'absent', paths: [] } },
  };
  const proposal: Mutable<SetupPublisherProposal> = { schemaVersion: 1, kind: 'review-only-publisher-installation-proposal',
    destination: { repository: 'owner/project', repositoryId: 42, defaultBranch: 'main', head: base },
    path: SETUP_PUBLISHER_WORKFLOW_PATH, baseline: 'Readable absence',
    source: { repository: 'vypdev/copilot', commit: sourceCommit, pullRequest: 989, merged: false,
      maintainerApproval: 'A descriptive observation, never authority', workflowSha256: hash(workflow),
      actionManifestSha256: 'a'.repeat(64), actionBundleSha256: 'b'.repeat(64) },
    proposedWorkflowSha256: hash(workflow.replace('uses: ./', `uses: vypdev/copilot@${sourceCommit}`)),
    sourceChange: 'Reviewed publisher source', consumerTemplatesChanged: false, productionVerification: 'disabled',
    installationAuthorized: false, installedDestinationSha: null,
    nativeCanary: { status: 'not-run', explicitlyAuthorizedPullRequest: null, runId: null }, dependency: 976, coordination: 814 };
  return { proposal, inspection, manifest,
    syncManifest() { inspection.installation.manifest!.content = JSON.stringify(manifest); } };
}
type Fixture = ReturnType<typeof fixture>;
const plan = (f: Fixture, id = operation) => planSetupPublisherInstallation(f.proposal, f.inspection, id);
const pinWorkflow = (f: Fixture) => {
  f.proposal.source.workflowSha256 = hash(f.inspection.source.workflow);
  f.proposal.proposedWorkflowSha256 = hash(f.inspection.source.workflow.replace('uses: ./', `uses: vypdev/copilot@${f.inspection.source.commit}`));
};

describe('publisher immutable two-file planning', () => {
  it('publisher977-C106: matching manifest hashes cannot authorize empty required issue fields', () => {
    for (const kind of ['feature', 'bugfix', 'help', 'chore', 'documentation', 'hotfix', 'release'] as const) {
      const f = fixture();
      const file = f.inspection.installation.guidance.find(file => file.path === REPOSITORY_AGENT_PROFILE_PATH)!;
      const profile = JSON.parse(file.content);
      profile.issueWorkflows.forms[kind].requiredFields = [];
      file.content = JSON.stringify(profile);
      f.manifest.profileDigest = hash(file.content);
      f.manifest.artifacts[file.path].sha256 = hash(file.content);
      f.syncManifest();
      expect(() => plan(f)).toThrow(new SetupPublisherPlanError('installation-unsupported'));
    }
  });
  it.each(['feature', 'bugfix', 'help', 'chore', 'documentation', 'hotfix', 'release'] as const)(
    'publisher977-C104: self-consistent manifest hashes cannot authorize a wrong %s form template', kind => {
      const f = fixture();
      const file = f.inspection.installation.guidance.find(file => file.path === REPOSITORY_AGENT_PROFILE_PATH)!;
      const profile = JSON.parse(file.content);
      profile.issueWorkflows.forms[kind].template = 'foreign-form.yml';
      file.content = JSON.stringify(profile);
      f.manifest.profileDigest = hash(file.content);
      f.manifest.artifacts[file.path].sha256 = hash(file.content);
      f.syncManifest();
      expect(() => plan(f)).toThrow(new SetupPublisherPlanError('installation-unsupported'));
    },
  );
  it('publisher977-C02 rejects an arbitrary destination URL before deriving a plan', () => {
    const f = fixture(); f.proposal.destination.repository = 'https://example.invalid/owner/project';
    expect(() => plan(f)).toThrow('invalid or unsupported');
  });
  it.each(['repositoryId', 'repository', 'defaultBranch'] as const)('publisher977-C02 rejects contradictory destination %s declarations', key => {
    const f = fixture();
    if (key === 'repositoryId') f.proposal.destination.repositoryId = f.inspection.target.id + 1;
    if (key === 'repository') f.proposal.destination.repository = 'other/project';
    if (key === 'defaultBranch') f.proposal.destination.defaultBranch = 'other-default';
    expect(() => plan(f)).toThrow(new SetupPublisherPlanError('destination-changed'));
  });
  it('publisher977-C09 derives the plan before its receipt and then binds both final files', () => {
    const f = fixture(), result = plan(f);
    expect(result.status).toBe('review');
    expect(result.files.map(file => file.path)).toEqual([SETUP_PUBLISHER_WORKFLOW_PATH, SETUP_INSTALLATION_MANIFEST_PATH]);
    expect(result.files[0].content).toBe(f.inspection.source.workflow.replace('uses: ./', `uses: vypdev/copilot@${sourceCommit}`));
    const final = JSON.parse(result.files[1].content!);
    expect(final.installation).toEqual({ schemaVersion: 1, operationId: operation, repositoryId: 42, baseSha: base, planDigest: result.digest });
    const { installation: _old, ...original } = f.manifest;
    const { installation: _new, ...preserved } = final;
    expect(preserved).toEqual(original);
    expect(result.approvalDigest).not.toBe(result.digest);
    expect(setupPublisherApprovalMatches(result, result.files)).toBe(true);
    expect(plan(f)).toEqual(result);
    expect(result.nativeVerification).toBe('pending');
  });

  it('publisher977-C07 keeps the complete reviewed bytes and metadata immutable after inputs change', () => {
    const f = fixture(), result = plan(f), original = JSON.stringify(result);
    f.inspection.target.name = 'different'; f.inspection.source.workflow = 'changed'; f.manifest.generator.name = 'changed';
    expect(JSON.stringify(result)).toBe(original);
    for (const value of [result, result.target, result.files, ...result.files]) expect(Object.isFrozen(value)).toBe(true);
  });

  it('publisher977-C08 ignores proposal approval/merge descriptions and excludes extra credential fields from digests and preview', () => {
    const f = fixture(), before = plan(f);
    f.proposal.source.merged = true; f.proposal.source.maintainerApproval = 'APPROVED'; f.proposal.baseline = 'invented authority';
    Object.assign(f.inspection.target, { token: 'DO_NOT_COPY', credentialHash: 'DO_NOT_HASH' });
    Object.assign(f.inspection.authority, { token: 'DO_NOT_COPY' });
    const after = plan(f);
    expect(after).toEqual(before);
    expect(JSON.stringify(after)).not.toMatch(/DO_NOT_|token|credentialHash/u);
    f.inspection.source.reviewedRevision = null;
    expect(() => plan(f)).toThrow(new SetupPublisherPlanError('source-unverified'));
  });

  const changes: readonly [string, (f: Fixture) => void][] = [
    ['owner identity', f => { f.inspection.target.ownerId++; }],
    ['repository identity', f => { f.inspection.target.id++; f.inspection.authority.repositoryId++; f.proposal.destination.repositoryId++;
      f.manifest.installation.repositoryId++; f.syncManifest(); }],
    ['default revision', f => { f.inspection.target.baseSha = '5'.repeat(40); f.proposal.destination.head = '5'.repeat(40); }],
    ['default branch', f => { f.inspection.target.defaultBranch = 'release'; f.proposal.destination.defaultBranch = 'release'; }],
    ['audited actor', f => { f.inspection.authority.actorId++; }],
    ['source repository identity', f => { f.inspection.source.repositoryId++; }],
    ['reviewed source revision', f => { const sha = '6'.repeat(40); Object.assign(f.inspection.source,
      { commit: sha, reviewedRevision: sha, mergedRevision: sha }); f.proposal.source.commit = sha; pinWorkflow(f); }],
    ['source pull request', f => { f.inspection.source.pullRequest++; f.proposal.source.pullRequest++; }],
    ['source bundle', f => { f.inspection.source.actionBundleSha256 = 'c'.repeat(64); f.proposal.source.actionBundleSha256 = 'c'.repeat(64); }],
    ['source action manifest', f => { f.inspection.source.actionManifestSha256 = 'c'.repeat(64); f.proposal.source.actionManifestSha256 = 'c'.repeat(64); }],
    ['source workflow bytes', f => { f.inspection.source.workflow = '# reviewed new bytes\n' + f.inspection.source.workflow; pinWorkflow(f); }],
    ['original manifest bytes', f => { f.inspection.installation.manifest!.content += '\n'; }],
  ];
  it.each(changes)('publisher977-C06 changes plan and final-byte approval for a newly reviewed %s', (_label, mutate) => {
    const f = fixture(), before = plan(f); mutate(f); const after = plan(f);
    expect(after.digest).not.toBe(before.digest); expect(after.approvalDigest).not.toBe(before.approvalDigest);
  });
  it('publisher977-C06 separates operation identity and purpose from a previous receipt', () => {
    const f = fixture(), before = plan(f), after = plan(f, '87654321-4321-4234-8234-123456789abc');
    expect(before.purpose).toBe('bugbot-status-publisher'); expect(after.digest).not.toBe(before.digest);
    expect(() => plan(f, 'legacy-or-arbitrary-operation')).toThrow();
    expect(setupPublisherApprovalMatches({ ...before, purpose: 'other' as 'bugbot-status-publisher' }, before.files)).toBe(false);
  });

  it.each(['workflow', 'receipt', 'order', 'extra file', 'missing file', 'deletion', 'path', 'extra fields'])(
    'publisher977-C07 refuses post-preview changes to %s', mutation => {
      const result = plan(fixture()); const files: SetupBatchFile[] = result.files.map(file => ({ ...file }));
      if (mutation === 'workflow') files[0] = { ...files[0], content: files[0].content + '# added\n' };
      if (mutation === 'receipt') files[1] = { ...files[1], content: files[1].content + '\n' };
      if (mutation === 'order') files.reverse();
      if (mutation === 'extra file') files.push({ path: 'human.txt', content: 'other' });
      if (mutation === 'missing file') files.pop();
      if (mutation === 'deletion') files[0] = { ...files[0], content: null };
      if (mutation === 'path') files[0] = { ...files[0], path: '.github/workflows/other.yml' };
      if (mutation === 'extra fields') files[0] = { ...files[0], resourceWriter: true } as SetupBatchFile;
      expect(setupPublisherApprovalMatches(result, files)).toBe(false);
    },
  );

  it('publisher977-C24 reports exact existing bytes as unchanged with native verification pending and no empty delivery', () => {
    const f = fixture(), desired = plan(f).files[0];
    f.inspection.installation.workflows.push({ path: desired.path, mode: '100644', content: desired.content! });
    f.inspection.installation.publisher = { kind: 'exact', paths: [desired.path] };
    const result = plan(f); expect(result.status).toBe('unchanged'); expect(result.files).toEqual([]);
    expect(result.approvalDigest).toBeNull(); expect(result.nativeVerification).toBe('pending');
    expect(setupPublisherApprovalMatches(result, result.files)).toBe(false);
  });
});

describe('publisher independently read snapshot admission', () => {
  const destinationChanges: readonly [string, (f: Fixture) => void][] = [
    ['repository id', f => { f.inspection.target.id++; }], ['coordinate', f => { f.inspection.target.name = 'other'; }],
    ['default', f => { f.inspection.target.defaultBranch = 'other'; }], ['base', f => { f.inspection.target.baseSha = '9'.repeat(40); }],
    ['archived', f => { f.inspection.target.archived = true; }], ['disabled', f => { f.inspection.target.disabled = true; }],
    ['read only', f => { f.inspection.target.canPush = false; }], ['unknown privacy', f => { f.inspection.target.private = undefined as unknown as boolean; }],
  ];
  it.each(destinationChanges)('publisher977-C21 blocks a changed or unavailable destination: %s', (_label, mutate) => {
    const f = fixture(); mutate(f); expect(() => plan(f)).toThrow(new SetupPublisherPlanError('destination-changed'));
  });
  it('accepts a canonical coordinate with different casing without trusting a different repository identity', () => {
    const f = fixture(), before = plan(f); f.proposal.destination.repository = 'OWNER/PROJECT'; expect(plan(f)).toEqual(before);
  });
  it.each(['actor', 'repository', 'contents', 'pullRequests', 'workflows'])(
    'publisher977-C18 blocks unknown or denied relevant authority: %s', key => {
      const f = fixture();
      if (key === 'actor') f.inspection.authority.actorId = 0;
      else if (key === 'repository') f.inspection.authority.repositoryId++;
      else f.inspection.authority[key as 'contents' | 'pullRequests' | 'workflows'] = key === 'contents' ? 'denied' : 'unknown';
      expect(() => plan(f)).toThrow(new SetupPublisherPlanError('authority-unverified'));
    },
  );
  const sourceChanges: readonly [string, (f: Fixture) => void][] = [
    ['foreign source', f => { f.inspection.source.repository = 'other/copilot'; }],
    ['unknown id', f => { f.inspection.source.repositoryId = 0; }],
    ['revision', f => { f.inspection.source.commit = '9'.repeat(40); }],
    ['pull request', f => { f.inspection.source.pullRequest++; }],
    ['unreviewed revision', f => { f.inspection.source.reviewedRevision = null; }],
    ['unmerged revision', f => { f.inspection.source.mergedRevision = null; }],
    ['workflow bytes', f => { f.inspection.source.workflow += '# drift'; }],
    ['action manifest', f => { f.inspection.source.actionManifestSha256 = 'c'.repeat(64); }],
    ['bundle bytes', f => { f.inspection.source.actionBundleSha256 = 'c'.repeat(64); }],
    ['proposed workflow hash', f => { f.proposal.proposedWorkflowSha256 = 'c'.repeat(64); }],
    ['oversized workflow', f => { f.inspection.source.workflow = 'x'.repeat(100_001); }],
    ['NUL workflow', f => { f.inspection.source.workflow += '\0'; }],
    ['nontext workflow', f => { f.inspection.source.workflow = null as unknown as string; }],
    ['unsupported root layout', f => { f.inspection.source.workflow = 'name: no-root-call\n'; pinWorkflow(f); }],
  ];
  it.each(sourceChanges)('publisher977-C22 refuses independently observed %s before preview', (_label, mutate) => {
    const f = fixture(); f.proposal.source.merged = true; mutate(f);
    expect(() => plan(f)).toThrow(new SetupPublisherPlanError('source-unverified'));
  });

  const manifestChanges: readonly [string, (f: Fixture) => void][] = [
    ['absent', f => { f.inspection.installation.manifest = null; }],
    ['wrong path', f => { f.inspection.installation.manifest!.path = 'other.json'; }],
    ['symlink', f => { f.inspection.installation.manifest!.mode = '120000'; }],
    ['executable', f => { f.inspection.installation.manifest!.mode = '100755'; }],
    ['nontext', f => { f.inspection.installation.manifest!.content = null as unknown as string; }],
    ['oversized', f => { f.inspection.installation.manifest!.content = 'x'.repeat(100_001); }],
    ['invalid JSON', f => { f.inspection.installation.manifest!.content = '{'; }],
    ['future schema', f => { f.manifest.schemaVersion = 3; f.syncManifest(); }],
    ['future generator', f => { f.manifest.generator.contractVersion = 99; f.syncManifest(); }],
    ['future receipt', f => { f.manifest.installation.schemaVersion = 2; f.syncManifest(); }],
    ['foreign receipt', f => { f.manifest.installation.repositoryId++; f.syncManifest(); }],
    ['missing managed record', f => { delete f.manifest.artifacts[REPOSITORY_AGENT_GUIDE_PATH]; f.syncManifest(); }],
    ['missing managed bytes', f => { f.inspection.installation.guidance.shift(); }],
    ['tampered managed bytes', f => { f.inspection.installation.guidance[1].content += 'changed'; }],
    ['profile digest mismatch', f => { f.manifest.profileDigest = 'c'.repeat(64); f.syncManifest(); }],
    ['unsupported matching profile', f => { const profile = f.inspection.installation.guidance[0];
      profile.content = JSON.stringify({ ...JSON.parse(profile.content), schemaVersion: 99 });
      f.manifest.profileDigest = hash(profile.content); f.manifest.artifacts[profile.path].sha256 = hash(profile.content); f.syncManifest(); }],
    ['incomplete inventory', f => { f.inspection.installation.complete = false; }],
    ['duplicate guidance', f => { f.inspection.installation.guidance.push(f.inspection.installation.guidance[0]); }],
    ['symlink guidance', f => { f.inspection.installation.guidance[0].mode = '120000'; }],
    ['unknown guidance array', f => { f.inspection.installation.guidance = null as unknown as typeof f.inspection.installation.guidance; }],
    ['missing file entry', f => { f.inspection.installation.guidance[0] = null as unknown as typeof f.inspection.installation.guidance[0]; }],
    ['bad path entry', f => { f.inspection.installation.guidance[0].path = null as unknown as string; }],
    ['nontext entry', f => { f.inspection.installation.guidance[0].content = null as unknown as string; }],
    ['oversized entry', f => { f.inspection.installation.guidance[0].content = 'x'.repeat(100_001); }],
  ];
  it.each(manifestChanges)('publisher977-C11/C12/C13 blocks %s without inventing a baseline', (_label, mutate) => {
    const f = fixture(); mutate(f); expect(() => plan(f)).toThrow(new SetupPublisherPlanError('installation-unsupported'));
  });
  it.each(['missing start', 'missing end', 'duplicate start', 'duplicate end'])(
    'publisher977-C12 refuses ambiguous managed pointer bytes: %s', mutation => {
      const f = fixture(), pointer = f.inspection.installation.guidance[3];
      if (mutation === 'missing start') pointer.content = pointer.content.replace(REPOSITORY_AGENT_POINTER_START, '');
      if (mutation === 'missing end') pointer.content = pointer.content.replace(REPOSITORY_AGENT_POINTER_END, '');
      if (mutation === 'duplicate start') pointer.content += REPOSITORY_AGENT_POINTER_START;
      if (mutation === 'duplicate end') pointer.content += REPOSITORY_AGENT_POINTER_END;
      expect(() => plan(f)).toThrow(new SetupPublisherPlanError('installation-unsupported'));
    },
  );
  it('preserves supported reduced discovery and executable regular guidance without fabricating a pointer', () => {
    const f = fixture(); delete f.manifest.artifacts[REPOSITORY_AGENT_POINTER_PATH];
    f.inspection.installation.guidance.pop(); f.inspection.installation.guidance[1].mode = '100755'; f.syncManifest();
    expect(plan(f).files).toHaveLength(2);
  });
  it('retains exact CRLF workflow bytes and canonical compatible guidance hashes', () => {
    const f = fixture(); f.inspection.source.workflow = f.inspection.source.workflow.replace(/\n/gu, '\r\n'); pinWorkflow(f);
    for (const file of f.inspection.installation.guidance) file.content = file.content.replace(/\n/gu, '\r\n');
    const result = plan(f); expect(result.files[0].content).toContain('\r\n');
    expect(result.files[0].content!.replace(/\r\n/gu, '\n')).toBe(plan(fixture()).files[0].content);
  });

  it.each(['unknown', 'foreign', 'renamed', 'contradictory absence', 'multiple publishers', 'customized canonical', 'wrong canonical mode', 'duplicate workflow'])(
    'publisher977-C19/C20 refuses unsupported publisher inventory: %s', state => {
      const f = fixture(), desired = plan(f).files[0].content!;
      if (state === 'unknown' || state === 'foreign') f.inspection.installation.publisher = { kind: state, paths: [] };
      else {
        const path = state === 'renamed' ? '.github/workflows/renamed.yml' : SETUP_PUBLISHER_WORKFLOW_PATH;
        f.inspection.installation.workflows.push({ path, mode: state === 'wrong canonical mode' ? '100755' : '100644',
          content: state === 'customized canonical' ? desired + '# custom' : desired });
        if (state !== 'contradictory absence') f.inspection.installation.publisher = { kind: 'exact', paths: [path] };
        if (state === 'multiple publishers') f.inspection.installation.publisher.paths.push('.github/workflows/other.yml');
        if (state === 'duplicate workflow') f.inspection.installation.workflows.push(f.inspection.installation.workflows[1]);
      }
      expect(() => plan(f)).toThrow(new SetupPublisherPlanError('installation-unsupported'));
    },
  );
});
