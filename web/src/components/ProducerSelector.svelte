<script lang="ts">
  import type { SetupApprovalCheckCandidate } from '../../../src/application/contracts/web_setup_view';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  import { safeGithubRunLink, safeGithubRulesetLink } from '../lib/githubLink';
  import { toggleSelection } from '../lib/questionAnswer';
  import { checkConclusionLabel } from '../i18n/checkEvidence';
  import { manualProducerIdentity } from '../lib/manualProducerIdentity';
  export let candidates: readonly SetupApprovalCheckCandidate[];
  export let selected: string[];
  export let controller: boolean;
  let checkName = '';
  let appId = '';
  let workflowName = '';
  let error = false;
  $: known = new Set(candidates.map(candidate => `${candidate.name}|${candidate.sourceAppId}|${candidate.workflowName}`));
  $: manual = selected.filter(identity => !known.has(identity));
  function add(): void {
    const identity = manualProducerIdentity(checkName, appId, workflowName);
    if (!identity || selected.length >= 8) { error = true; return; }
    error = false;
    if (!selected.includes(identity)) selected = [...selected, identity];
    checkName = ''; appId = ''; workflowName = '';
  }
</script>

<div class="check-grid producer-grid" role="group" aria-label={tr('checksObserved', $setupLocale)}>
  {#each candidates as candidate}
    {@const identity = `${candidate.name}|${candidate.sourceAppId}|${candidate.workflowName}`}
    <div class="check-option producer-option">
      <label><input type="checkbox" checked={selected.includes(identity)} onchange={() => selected = toggleSelection(selected, identity)}
          disabled={!controller || (selected.length >= 8 && !selected.includes(identity))} />
        <span><strong><bdi>{candidate.name}</bdi></strong><small><bdi>{candidate.workflowName} · {candidate.sourceAppName ?? 'GitHub App'} {candidate.sourceAppId} · {checkConclusionLabel(candidate.conclusion, $setupLocale)} · {candidate.headSha.slice(0, 7)} · {candidate.observedAt ?? tr('observationTimeUnknown', $setupLocale)}</bdi></small><small>{candidate.requiredByRuleset ? tr('branchRequirementObserved', $setupLocale, { branch: candidate.requiredByRuleset.branch }) : tr('branchRequirementUnknown', $setupLocale)}</small></span>
      </label>
      {#if safeGithubRunLink(candidate.runUrl)}<a href={safeGithubRunLink(candidate.runUrl)} target="_blank" rel="noopener noreferrer">{tr('ciRun', $setupLocale)}</a>{/if}
      {#if safeGithubRulesetLink(candidate.requiredByRuleset?.sourceUrl)}<a href={safeGithubRulesetLink(candidate.requiredByRuleset?.sourceUrl)} target="_blank" rel="noopener noreferrer">{tr('ciRule', $setupLocale)}</a>{/if}
    </div>
  {/each}
</div>
{#if manual.length}<ul>{#each manual as identity}<li><bdi>{identity}</bdi> <button type="button" onclick={() => selected = toggleSelection(selected, identity)} disabled={!controller}>{tr('producerRemove', $setupLocale)}</button></li>{/each}</ul>{/if}
<p class="field-help">{tr('producerManualHelp', $setupLocale)}</p>
<div class="producer-manual-fields">
  <label for="producer-name">{tr('producerName', $setupLocale)}<input id="producer-name" type="text" bind:value={checkName} disabled={!controller} autocomplete="off" /></label>
  <label for="producer-app-id">{tr('producerAppId', $setupLocale)}<input id="producer-app-id" type="text" inputmode="numeric" pattern="[1-9][0-9]*" bind:value={appId} disabled={!controller} autocomplete="off" /></label>
  <label for="producer-workflow">{tr('producerWorkflow', $setupLocale)}<input id="producer-workflow" type="text" bind:value={workflowName} disabled={!controller} autocomplete="off" /></label>
</div>
<button type="button" onclick={add} disabled={!controller}>{tr('producerAdd', $setupLocale)}</button>
{#if error}<p class="field-error" role="alert">{tr('producerManualInvalid', $setupLocale)}</p>{/if}
