import { createHash } from 'node:crypto';
import type { SetupPublisherInspection, SetupPublisherProposal } from '../../../../domain/setup_publisher_installation';
import { SETUP_PUBLISHER_WORKFLOW_PATH } from '../../../../domain/setup_publisher_installation';
import { createDefaultSetupConfiguration } from '../../setup_configuration_defaults';
import { renderRepositoryAgentArtifacts, renderRepositoryAgentPointerBlock, REPOSITORY_AGENT_POINTER_PATH,
  REPOSITORY_AGENT_PROFILE_PATH, type ManagedRole } from '../../repository_agent_guidance_policy';
import { SETUP_INSTALLATION_MANIFEST_PATH } from '../../setup_installation_receipt_policy';

type Mutable<T> = T extends readonly (infer U)[] ? Mutable<U>[] : T extends object ? { -readonly [K in keyof T]: Mutable<T[K]> } : T;
const hash = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');
const base = '1'.repeat(40), sourceCommit = '2'.repeat(40);

export function setupPublisherFixture() {
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
