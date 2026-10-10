<script lang="ts">
  import type { WebSetupPrompt } from '../../../src/application/contracts/web_setup_view';
  import { initialQuestionAnswer, submittedQuestionAnswer, toggleSelection } from '../lib/questionAnswer';
  import ActionButton from './ActionButton.svelte';
  import { tr } from '../i18n/catalog';
  import { projectTransitionKey } from '../i18n/projectTransitions';
  import { setupLocale } from '../i18n/localeStore';
  import { safeHelpLink } from '../lib/helpLink';
  import { questionOptionLabel } from '../i18n/questionOptions';
  import DiscoveryNotice from './DiscoveryNotice.svelte';
  import ProducerSelector from './ProducerSelector.svelte';
  import ProjectSelector from './ProjectSelector.svelte';
  import QuestionGuidance from './QuestionGuidance.svelte';
  import CoverageCheckEvidence from './CoverageCheckEvidence.svelte';
  import FixedWorkflowNotice from './FixedWorkflowNotice.svelte';
  type Prompt = Extract<WebSetupPrompt, { kind: 'question' }>;
  export let prompt: Prompt;
  export let controller: boolean;
  export let busy: boolean;
  export let onSubmit: (value: string) => Promise<void>;
  export let onRetryDiscovery: () => Promise<void>;
  export let onBack: () => Promise<void>;
  let { value, selected } = initialQuestionAnswer(prompt);
  $: explanation = prompt.presentation?.[$setupLocale];
  $: helpUrl = safeHelpLink(explanation?.documentation?.url);
  $: suggestedAnswer = typeof prompt.question.defaultValue === 'boolean'
    ? tr(prompt.question.defaultValue ? 'yes' : 'no', $setupLocale)
    : prompt.question.defaultValue === '' ? tr('none', $setupLocale)
      : prompt.question.kind === 'choice' || prompt.question.kind === 'multi-select'
        ? questionOptionLabel(prompt.question.id, String(prompt.question.defaultValue), $setupLocale)
        : String(prompt.question.defaultValue);
</script>
<div class="question-heading"><h2>{explanation?.label ?? prompt.question.label.replace(' (Space toggles, Enter confirms)', '')}</h2>{#if prompt.phase === 'permission-intent'}<span class="phase-tag">{tr('permissionPreview', $setupLocale)}</span>{/if}</div>
{#if prompt.progress}<p class="field-help" role="status">{tr('questionProgress', $setupLocale, { current: String(prompt.progress.groupPosition), total: String(prompt.progress.groupTotal), overall: String(prompt.progress.position), all: String(prompt.progress.total) })}</p>{/if}
{#if explanation}<p class="description">{explanation.summary}</p>{/if}
{#if prompt.question.id === 'pullRequestApproval.testChecks'}<DiscoveryNotice kind="checks" status={prompt.question.discoveryStatus} truncated={prompt.question.discoveryTruncated} />{/if}
{#if prompt.question.id === 'projects.ids'}<DiscoveryNotice kind="projects" status={prompt.question.discoveryStatus} truncated={prompt.question.discoveryTruncated} />{/if}
{#if prompt.question.discoveryRetryRemaining !== undefined}
  <div class="discovery-actions">
    {#if prompt.question.discoveryRetryRemaining > 0}
      <button class="secondary-button" onclick={onRetryDiscovery} disabled={!controller || busy}>{tr('retryDiscovery', $setupLocale)}</button>
      <span class="field-help">{tr('retryRemaining', $setupLocale, { count: String(prompt.question.discoveryRetryRemaining) })}</span>
    {:else}
      <p class="field-help">{tr('retryExhausted', $setupLocale)}</p>
  {/if}
</div>
{/if}
{#if prompt.question.statusOptionState === 'unavailable'}<p class="discovery-notice" role="status">{tr('projectStatusUnavailable', $setupLocale)}</p>{/if}
{#if prompt.question.statusOptionState === 'incompatible'}<p class="discovery-notice" role="alert">{tr('projectStatusIncompatible', $setupLocale)}</p>{/if}
{#if prompt.question.id === 'projects.ids'}<p class="field-help">{tr('projectSharedStatus', $setupLocale)}</p>{/if}
<FixedWorkflowNotice question={prompt.question} />
{#if prompt.question.projectStatusValues}<ul class="status-review-list">{#each prompt.question.projectStatusValues as item}<li>{tr(projectTransitionKey[item.transition], $setupLocale)}: <strong><bdi>{item.value}</bdi></strong></li>{/each}</ul>{/if}
{#if prompt.question.kind === 'boolean'}
  <div class="segmented" role="group" aria-label={explanation?.label ?? prompt.question.label}><button class:selected={value === 'yes' || value === 'true'} aria-pressed={value === 'yes' || value === 'true'} onclick={() => value = 'yes'} disabled={!controller}>{tr('yes', $setupLocale)}</button><button class:selected={value === 'no' || value === 'false'} aria-pressed={value === 'no' || value === 'false'} onclick={() => value = 'no'} disabled={!controller}>{tr('no', $setupLocale)}</button></div>
{:else if prompt.question.kind === 'choice'}
  <select id="answer" aria-label={explanation?.label ?? prompt.question.label} bind:value disabled={!controller}>
    {#if !prompt.question.defaultValue}<option value="" disabled>{tr('selectOne', $setupLocale)}</option>{/if}
    {#each prompt.question.choices ?? [] as option}
      {@const producer = prompt.question.id === 'pullRequestApproval.coverage.checkName'
        ? prompt.question.trustedProducers?.find(candidate => candidate.name === option) : undefined}
      <option value={option}>{producer ? `${option} — ${producer.workflowName} · App ${producer.sourceAppId}` : questionOptionLabel(prompt.question.id, option, $setupLocale)}</option>
    {/each}
  </select>
  {#if prompt.question.id === 'pullRequestApproval.coverage.checkName'}
    {#each (prompt.question.producerCandidates ?? []).filter(candidate => candidate.name === value) as candidate}
      <CoverageCheckEvidence {candidate} />
    {/each}
  {/if}
{:else if prompt.question.kind === 'producer-select'}
  <ProducerSelector candidates={prompt.question.producerCandidates ?? []} bind:selected {controller} />
{:else if prompt.question.kind === 'project-select'}
  <ProjectSelector candidates={prompt.question.projectCandidates ?? []} bind:selected bind:value {controller} />
{:else if prompt.question.kind === 'multi-select' || prompt.question.kind === 'scope-overrides'}
  <div class="check-grid" role="group" aria-label={explanation?.label ?? prompt.question.label}>{#each (prompt.question.kind === 'multi-select' ? prompt.question.choices ?? [] : prompt.question.allowedNames ?? []) as option}<label class="check-option"><input type="checkbox" checked={selected.includes(option)} onchange={() => selected = toggleSelection(selected, option)} disabled={!controller} /><span>{prompt.question.kind === 'multi-select' ? questionOptionLabel(prompt.question.id, option, $setupLocale) : option}</span></label>{/each}</div>
{:else}
  {#if prompt.question.id === 'ai.bugbotOrganizationRules'}
    <textarea id="answer" aria-label={explanation?.label ?? prompt.question.label} rows="6" bind:value disabled={!controller} spellcheck="true"></textarea>
  {:else}
    <input id="answer" aria-label={explanation?.label ?? prompt.question.label} type={prompt.question.kind === 'number' ? 'number' : 'text'} min={prompt.question.kind === 'number' ? 0 : undefined} bind:value disabled={!controller} autocomplete="off" />
  {/if}
{/if}
<p class="field-help">{tr('suggested', $setupLocale, { answer: suggestedAnswer })}</p>
{#if prompt.question.suggestionSource}<p class="field-help" role="status">{tr(prompt.question.suggestionSource === 'github' ? 'sourceGithub' : prompt.question.suggestionSource === 'local' ? 'sourceLocal' : prompt.question.suggestionSource === 'configuration' ? 'sourceConfig' : 'sourceDefault', $setupLocale)}</p>{/if}
<QuestionGuidance {explanation} {helpUrl} />
<div class="button-row">
  {#if prompt.canGoBack}<ActionButton label={tr('previousQuestion', $setupLocale)} variant="secondary" onClick={onBack} disabled={!controller || busy} />{/if}
  <ActionButton label={tr('continue', $setupLocale)} arrow onClick={() => onSubmit(submittedQuestionAnswer(prompt, value, selected))} disabled={!controller || busy} />
</div>
