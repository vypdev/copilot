<script lang="ts">
  import type { SetupBatchView } from '../../../src/application/contracts/web_setup_view';
  import { permissionName, permissionTerm } from '../i18n/permissionTerms';
  import { tr, type SetupMessageKey } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  export let batch: SetupBatchView;
  export let controller: boolean;
  export let busy: boolean;
  export let mode: 'review' | 'progress' | 'result' | 'closed' = 'progress';
  export let onSubmit: (value: string) => Promise<void> = async () => undefined;
  export let onStop: () => Promise<void> = async () => undefined;
  const statuses: Record<SetupBatchView['targets'][number]['status'], SetupMessageKey> = {
    ready: 'batchStatusReady', blocked: 'batchStatusBlocked', applying: 'batchStatusApplying', partial: 'batchStatusPartial',
    'waiting-for-merge': 'batchStatusWaiting', 'verification-pending': 'batchStatusPending', unchanged: 'batchStatusUnchanged', cancelled: 'batchStatusCancelled',
  };
  $: ready = batch.targets.some(target => target.cleanupPending) ? []
    : batch.targets.filter(target => ['ready', 'partial', 'cancelled', 'applying'].includes(target.status));
  function safePull(url: string | undefined): string | undefined {
    return url && /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9][0-9]*$/.test(url) ? url : undefined;
  }
</script>

<div class="batch-setup">
  <h2>{tr(mode === 'review' ? 'batchReviewTitle' : mode === 'progress' ? 'batchProgressTitle' : 'batchResultTitle', $setupLocale)}</h2>
  <p>{tr(mode === 'review' ? 'batchReviewBody' : mode === 'progress' ? 'batchProgressBody' : 'batchResultBody', $setupLocale)}</p>
  {#if batch.stopRequested}<p class="banner warning" role="status">{tr('batchStopping', $setupLocale)}</p>{/if}
  <div class="batch-targets">
    {#each batch.targets as target (target.repositoryId)}
      <section class="batch-target">
        <h3>{target.repository}</h3>
        <p class="target-status" role="status">{tr(statuses[target.status], $setupLocale)}</p>
        {#if target.cleanupPending}<p class="banner warning" role="alert">{tr('batchCleanupPending', $setupLocale)}</p>{/if}
        {#if target.blockers?.length}<ul>{#each target.blockers as blocker}<li>{blocker}</li>{/each}</ul>{/if}
        {#if target.reason && !target.cleanupPending}<p>{tr(target.reason === 'drift' || target.reason === 'ownership' ? 'batchReasonDrift'
          : target.reason === 'provider' ? 'batchReasonProvider' : target.reason === 'cancelled' ? 'batchReasonCancelled' : 'batchReasonPreflight', $setupLocale)}</p>{/if}
        <details><summary>{tr('batchBranchReview', $setupLocale)}</summary><p><code>{target.installationBranch}</code> → <code>{target.baseBranch}</code></p><code>{target.baseSha}</code></details>
        {#if safePull(target.pullRequestUrl)}<a class="github-link" href={safePull(target.pullRequestUrl)} target="_blank" rel="noopener noreferrer">{tr('batchOpenPull', $setupLocale)} ↗</a>{/if}
        {#if !['waiting-for-merge', 'verification-pending', 'unchanged'].includes(target.status)}
          <ul>
            <li>{tr('batchFilesCount', $setupLocale, { count: String(target.files.length) })}</li>
            <li>{tr('batchVariablesCount', $setupLocale, { count: String(target.repositoryVariables.length) })}</li>
            <li>{tr('batchGrantsCount', $setupLocale, { count: String(target.grants.length) })}</li>
          </ul>
          {#if target.retainedSecrets.length}<p>{tr('batchRetainedSecrets', $setupLocale)}: {target.retainedSecrets.join(', ')}.</p>{/if}
          <p>{tr('batchResourcesExplanation', $setupLocale)}</p>
          {#if target.permissionProbes?.length}<details><summary>{tr('planPermissionProbeTitle', $setupLocale)}</summary>
            <p>{tr('planPermissionProbeBody', $setupLocale)}</p>
            <ul>{#each target.permissionProbes as probe}<li>{permissionTerm($setupLocale, probe.scope)}: {permissionName($setupLocale, probe.permission)}</li>{/each}</ul>
            {#if target.permissionProbes.some(probe => probe.permission === 'Secrets')}<p>{tr('planSecretProbeLimit', $setupLocale)}</p>{/if}
          </details>{/if}
          {#if target.files.length}<details><summary>{tr('batchReviewFiles', $setupLocale)}</summary>
            {#each target.files as file}<details><summary><code>{file.path}</code></summary>
              {#if file.content === null}<p>{tr('batchDeleteFile', $setupLocale)}</p>{:else}<pre>{file.content}</pre>{/if}
            </details>{/each}
          </details>{/if}
          {#if target.repositoryVariables.length}<details><summary>{tr('batchRepositoryOverrides', $setupLocale)}</summary><p>{target.repositoryVariables.join(', ')}</p></details>{/if}
          {#if target.grants.length}<details><summary>{tr('batchReviewedAccess', $setupLocale)}</summary><ul>{#each target.grants as grant}<li>{grant.kind === 'secret' ? 'Secret' : 'Variable'} <code>{grant.name}</code></li>{/each}</ul></details>{/if}
        {/if}
      </section>
    {/each}
  </div>
  {#if mode === 'review'}<div class="batch-buttons">
    <button class="primary" onclick={() => onSubmit('approve')} disabled={!controller || busy || !ready.length}>{tr('batchApplyPlans', $setupLocale)}</button>
    <button class="secondary-button" onclick={() => onSubmit('decline')} disabled={!controller || busy}>{tr('batchLeavePreview', $setupLocale)}</button>
  </div>{:else if mode === 'progress'}
    <button class="secondary-button" onclick={onStop} disabled={!controller || busy || batch.stopRequested}>{tr('batchStopPending', $setupLocale)}</button>
  {:else if mode === 'result'}<div class="batch-buttons">
    {#if ready.length && batch.retryRemaining > 0}<button class="primary" onclick={() => onSubmit('retry')} disabled={!controller || busy}>{tr('batchRetryPending', $setupLocale)}</button>{/if}
    <button class="secondary-button" onclick={() => onSubmit('finish')} disabled={!controller || busy}>{tr('batchFinish', $setupLocale)}</button>
  </div>{/if}
  <details class="batch-technical"><summary>{tr('batchTechnical', $setupLocale)}</summary><code>{batch.operationId}</code></details>
</div>

<style>
  .batch-targets { display: grid; gap: 1rem; margin-block: 1rem; }
  .batch-target { border: 1px solid var(--line); padding: 1rem; border-radius: .8rem; min-width: 0; }
  h3 { overflow-wrap: anywhere; margin-top: 0; }
  .target-status { font-weight: 600; }
  pre { overflow: auto; max-height: 24rem; padding: .75rem; font-size: .78rem; }
  code { overflow-wrap: anywhere; }
  details { margin-block: .75rem; }
  .batch-buttons { display: flex; gap: .75rem; flex-wrap: wrap; }
  .batch-technical { margin-top: 1.25rem; }
</style>
