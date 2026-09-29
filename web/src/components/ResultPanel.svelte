<script lang="ts">
  import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
  import { tr, stageLabel, type SetupMessageKey } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  import ActionButton from './ActionButton.svelte';
  import { focusOnRevision } from '../lib/focusOnRevision';
  export let outcome: NonNullable<WebSetupView['outcome']>;
  export let controller: boolean;
  export let onClose: () => Promise<void>;
  export let onDoctor: () => Promise<void> = async () => undefined;
  export let doctor: WebSetupView['doctor'] = undefined;
  export let detail: WebSetupView['resultDetail'] = undefined;
  const reasons: Record<NonNullable<WebSetupView['resultDetail']>['reasonCode'], [SetupMessageKey, SetupMessageKey]> = {
    permissions: ['reasonPermissions', 'nextPermissions'], storage: ['reasonStorage', 'nextStorage'],
    configuration: ['reasonConfiguration', 'nextConfiguration'], 'session-expired': ['reasonExpired', 'nextExpired'],
    cancelled: ['reasonCancelled', 'nextCancelled'], provider: ['reasonProvider', 'nextProvider'],
    'rate-limit': ['reasonRateLimit', 'nextRateLimit'], unknown: ['reasonUnknown', 'nextUnknown'],
  };
  const effectKeys: Record<string, SetupMessageKey> = { files: 'receiptFiles', secrets: 'receiptSecrets',
    labels: 'receiptLabels', 'issue-types': 'receiptIssueTypes', variables: 'receiptVariables', 'initial-tag': 'receiptInitialTag' };
  $: heading = outcome === 'complete' ? tr('resultApplied', $setupLocale)
    : outcome === 'dry-run' ? tr('resultNoChanges', $setupLocale)
    : outcome === 'cancelled' || outcome === 'blocked' ? tr('resultStopped', $setupLocale)
    : tr('resultPartial', $setupLocale);
  $: explanation = outcome === 'complete'
    ? tr('resultCompleteBody', $setupLocale)
    : outcome === 'partial'
      ? tr('resultPartialBody', $setupLocale)
      : tr('resultNoChangesBody', $setupLocale);
</script>

<section class="card result-card" tabindex="-1" use:focusOnRevision={1}><span class="result-icon" aria-hidden="true">{outcome === 'complete' ? '✓' : '!'}</span><h2>{heading}</h2>
  {#if outcome === 'blocked' || outcome === 'cancelled' || outcome === 'partial'}
    <div class="result-facts">
      <p><strong>{tr('whatHappened', $setupLocale)}:</strong> {tr(reasons[detail?.reasonCode ?? 'unknown'][0], $setupLocale)}</p>
      {#if detail?.stoppedStage}<p><strong>{tr('progress', $setupLocale)}:</strong> {stageLabel(detail.stoppedStage, $setupLocale)}</p>{/if}
      <p><strong>{tr('alreadyChanged', $setupLocale)}:</strong> {detail?.mutationStarted || outcome === 'partial' ? tr('inspectPartial', $setupLocale) : tr('noChanges', $setupLocale)}</p>
      <p><strong>{tr('nextAction', $setupLocale)}:</strong> {outcome === 'partial' ? `${tr('inspectPartial', $setupLocale)} ${tr(reasons[detail?.reasonCode ?? 'unknown'][1], $setupLocale)}` : tr(reasons[detail?.reasonCode ?? 'unknown'][1], $setupLocale)}</p>
      {#if detail?.diagnosticRef}<p><strong>{tr('diagnosticReference', $setupLocale)}:</strong> <code>{detail.diagnosticRef}</code></p>{/if}
    </div>
  {/if}
  {#if detail?.effects?.length}
    <section class="result-effects"><h3>{tr('resourceReceipt', $setupLocale)}</h3>
      <ul>{#each detail.effects as effect}<li><bdi>{effectKeys[effect.id] ? tr(effectKeys[effect.id], $setupLocale) : effect.id}</bdi> — {tr(effect.state === 'completed' ? 'effectCompleted' : effect.state === 'skipped' ? 'effectSkipped' : effect.state === 'not-started' ? 'effectNotStarted' : 'effectInspect', $setupLocale)}{#if effect.scope} · {tr(effect.scope === 'local' ? 'scopeLocal' : effect.scope === 'organization' ? 'scopeOrganization' : effect.scope === 'mixed' ? 'scopeMixed' : 'scopeRepository', $setupLocale)}{/if}</li>{/each}</ul>
    </section>
  {/if}
  <p>{explanation}</p>
  {#if outcome === 'complete'}<p>{tr('botRenewal', $setupLocale)}</p>{/if}
  <p>{tr('doctorHelp', $setupLocale)}</p>
  {#if outcome === 'complete'}
    <section class="result-doctor" aria-live="polite">
      {#if doctor?.status === 'running'}<p>{tr('doctorRunning', $setupLocale)}</p>
      {:else if doctor?.status === 'complete'}<p>{tr(doctor.healthy ? 'doctorPassed' : 'doctorWarnings', $setupLocale)} {tr('doctorCounts', $setupLocale, { pass: String(doctor.pass ?? 0), warn: String(doctor.warn ?? 0), fail: String(doctor.fail ?? 0), skipped: String(doctor.skipped ?? 0) })} {tr('doctorSecretLimit', $setupLocale)}</p>
      {:else if doctor?.status === 'failed'}<p>{tr('doctorFailed', $setupLocale)}</p>{/if}
      {#if controller && doctor?.status !== 'running' && doctor?.status !== 'complete'}<ActionButton label={tr('doctorRun', $setupLocale)} variant="secondary" onClick={onDoctor} />{/if}
    </section>
  {/if}
  <div class="result-links"><a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer">{tr('patSettings', $setupLocale)}</a><code>copilot doctor --read-only</code></div>{#if controller}<ActionButton label={tr('closeSession', $setupLocale)} onClick={onClose} />{/if}</section>
