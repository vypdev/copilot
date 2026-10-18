import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import type { SetupConfiguration } from '../domain/setup';
import type { SetupBatchFile } from '../domain/setup_batch';
import type { SetupBatchRenderPort } from '../application/ports/setup_batch_ports';
import { validSetupBatchAssetPath } from '../application/policies/setup_batch_policy';
import { copySetupFiles, ensureGitHubDirs, compareSetupWorkflows } from '../utils/setup_files';
import { effectiveIssueWorkflowFeatures } from '../application/policies/setup_issue_workflow_policy';
import { hasRootLocalSetupAction } from '../utils/setup_workflow_upgrade';
import { inspectSetupInstallation } from '../utils/setup_installation_review';
import { REPOSITORY_AGENT_GUIDE_PATH, REPOSITORY_AGENT_PROFILE_PATH, REPOSITORY_AGENT_MANIFEST_PATH,
  REPOSITORY_AGENT_SKILL_PATH } from '../application/policies/repository_agent_guidance_policy';

/** Existing setup renderers run inside a disposable directory, never in another checkout. */
export class SetupBatchWorkspaceAdapter implements SetupBatchRenderPort {
  async review(configuration: SetupConfiguration, existing: readonly SetupBatchFile[]) {
    const root = mkdtempSync(join(tmpdir(), 'copilot-setup-review-'));
    try {
      seedWorkspace(root, existing);
      return inspectSetupInstallation(root, configuration);
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
  digest(value: string): string { return createHash('sha256').update(value).digest('hex'); }
  operationId(): string { return randomUUID(); }
  async render(configuration: SetupConfiguration, existing: readonly SetupBatchFile[]): Promise<readonly SetupBatchFile[]> {
    const root = mkdtempSync(join(tmpdir(), 'copilot-setup-render-'));
    try {
      seedWorkspace(root, existing);
      ensureGitHubDirs(root);
      const sourceAction = existing.some(file => file.path.startsWith('.github/workflows/') && hasRootLocalSetupAction(file.content!));
      const sourceGuidance = [REPOSITORY_AGENT_GUIDE_PATH, REPOSITORY_AGENT_PROFILE_PATH, REPOSITORY_AGENT_MANIFEST_PATH,
        REPOSITORY_AGENT_SKILL_PATH].filter(path => existing.some(file => file.path === path));
      if (sourceAction && sourceGuidance.length > 0 && sourceGuidance.length !== 4) {
        throw new Error('Source repository guidance is incomplete. Restore it with the checked-in source generator, then review setup again.');
      }
      const sourceObserver = join(__dirname, '..', '..', 'setup', 'source-workflows', 'copilot_pull_request_approval.yml');
      const observerPath = '.github/workflows/copilot_pull_request_approval.yml';
      const preserveSourceObserver = configuration.pullRequestApproval.mode !== 'off' && existsSync(sourceObserver)
        && existing.some(file => file.path === observerPath && file.content === readFileSync(sourceObserver, 'utf8'));
      const changedWorkflows = compareSetupWorkflows(root, effectiveIssueWorkflowFeatures(configuration), undefined, configuration)
        .filter(workflow => workflow.status === 'changed' && (!preserveSourceObserver || workflow.file !== 'copilot_pull_request_approval.yml')
          && (!sourceAction || workflow.file === 'copilot_commit.yml')).map(workflow => workflow.file);
      copySetupFiles(root, undefined, configuration.features, { setupConfiguration: configuration,
        updateExistingWorkflows: true, approvedWorkflowFiles: changedWorkflows,
        preserveExistingAgentGuidance: sourceAction && sourceGuidance.length === 4 });
      const previous = new Map(existing.map(file => [file.path, file.content]));
      const generated = new Map<string, string>();
      const visit = (directory: string): void => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const path = join(directory, entry.name);
          if (entry.isDirectory()) visit(path);
          else if (entry.isFile()) {
            let key = relative(root, path).split('\\').join('/');
            const content = readFileSync(path, 'utf8');
            // Remove only the generated timestamp; preserve each asset's relative
            // backup path so equal basenames and content cannot collapse.
            if (key.startsWith('.copilot/setup-backups/') && !previous.has(key)) {
              const assetPath = key.split('/').slice(3).join('/');
              key = `.copilot/setup-backups/${this.digest(content).slice(0, 16)}/${assetPath}`;
            }
            if (!validSetupBatchAssetPath(key)) throw new Error('Renderer produced an unexpected setup asset.');
            generated.set(key, content);
          } else throw new Error('Setup assets must be regular files.');
        }
      };
      visit(root);
      return [...new Set([...previous.keys(), ...generated.keys()])].sort().flatMap(path => {
        const content = generated.get(path) ?? null;
        return previous.get(path) === content ? [] : [{ path, content }];
      });
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
}

function seedWorkspace(root: string, existing: readonly SetupBatchFile[]): void {
  if (existing.length > 300 || new Set(existing.map(file => file.path)).size !== existing.length
    || existing.some(file => !validSetupBatchAssetPath(file.path) || file.content === null || Buffer.byteLength(file.content) > 100_000)
    || existing.reduce((sum, file) => sum + Buffer.byteLength(file.content!), 0) > 2_000_000) throw new Error('Setup asset inventory is invalid or exceeds the fixed render budget.');
  for (const file of existing) {
    const destination = join(root, file.path); mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, file.content!, { mode: 0o600 });
  }
}
