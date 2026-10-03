<script lang="ts">
  import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
  import { tr, stageLabel, type SetupMessageKey } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  import ActionButton from './ActionButton.svelte';
  import ResourceProgress from './ResourceProgress.svelte';
  import { focusOnRevision } from '../lib/focusOnRevision';
  import { permissionName, permissionTerm } from '../i18n/permissionTerms';
  export let outcome: NonNullable<WebSetupView['outcome']>;
  export let controller: boolean;
  export let onClose: () => Promise<void>;
  export let onDoctor: () => Promise<void> = async () => undefined;
  export let doctor: WebSetupView['doctor'] = undefined;
  export let detail: WebSetupView['resultDetail'] = undefined;
  export let permissionReport: NonNullable<WebSetupView['permissions']>['report'] = undefined;
  const reasons: Record<NonNullable<WebSetupView['resultDetail']>['reasonCode'], [SetupMessageKey, SetupMessageKey]> = {
    permissions: ['reasonPermissions', 'nextPermissions'], storage: ['reasonStorage', 'nextStorage'],
    configuration: ['reasonConfiguration', 'nextConfiguration'], 'session-expired': ['reasonExpired', 'nextExpired'],
    cancelled: ['reasonCancelled', 'nextCancelled'], provider: ['reasonProvider', 'nextProvider'],
    'rate-limit': ['reasonRateLimit', 'nextRateLimit'], unknown: ['reasonUnknown', 'nextUnknown'],
  };
  $: heading = outcome === 'complete' ? tr('resultApplied', $setupLocale)
    : outcome === 'dry-run' ? tr('resultNoChanges', $setupLocale)
    : outcome === 'cancelled' || outcome === 'blocked' ? tr('resultStopped', $setupLocale)
    : tr('resultPartial', $setupLocale);
  $: explanation = outcome === 'complete'
    ? tr('resultCompleteBody', $setupLocale)
    : outcome === 'partial'
      ? tr('resultPartialBody', $setupLocale)
      : tr('resultNoChangesBody', $setupLocale);
  $: blockedPermissionReport = outcome === 'blocked' && detail?.reasonCode === 'permissions'
    ? permissionReport : undefined;
  $: unresolvedPermissions = blockedPermissionReport
    ? blockedPermissionReport.checks.filter(check => check.applicability === 'required'
      && check.status !== 'verified') : [];
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
  {#if blockedPermissionReport}
    <section class="result-facts" aria-label={tr('permissionReportTitle', $setupLocale)}>
      <h3>{tr('permissionReportTitle', $setupLocale)}</h3>
      <p>{tr('permissionReportLead', $setupLocale)}</p>
      <p><strong>{tr('permissionIdentity', $setupLocale)}:</strong> {tr(blockedPermissionReport.identityStatus === 'valid' ? 'permissionIdentityValid' : blockedPermissionReport.identityStatus === 'invalid' ? 'permissionIdentityInvalid' : 'permissionIdentityUnknown', $setupLocale)}</p>
      {#if unresolvedPermissions.length}
        <ul>{#each unresolvedPermissions as check}<li><strong>{permissionName($setupLocale, check.permission)}</strong>{#if $setupLocale !== 'en' && permissionName($setupLocale, check.permission) !== check.permission} <small><bdi>GitHub · {check.permission}</bdi></small>{/if} — {permissionTerm($setupLocale, check.scope)} · {permissionTerm($setupLocale, check.level)} · <strong>{blockedPermissionReport.identityStatus === 'valid' ? permissionTerm($setupLocale, check.status) : tr('permissionGrantNotChecked', $setupLocale)}</strong></li>{/each}</ul>
      {:else if blockedPermissionReport.identityStatus === 'valid'}
        <p>{tr('permissionReportNoFailedGrant', $setupLocale)}</p>
      {/if}
    </section>
  {/if}
  {#if detail?.effects?.length}
    <ResourceProgress effects={detail.effects} />
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
