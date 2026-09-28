<script lang="ts">
  import type { WebSetupPrompt } from '../../../src/application/contracts/web_setup_view';
  import { initialQuestionAnswer, submittedQuestionAnswer, toggleSelection } from '../lib/questionAnswer';
  import ActionButton from './ActionButton.svelte';
  type Prompt = Extract<WebSetupPrompt, { kind: 'question' }>;
  export let prompt: Prompt;
  export let controller: boolean;
  export let busy: boolean;
  export let onSubmit: (value: string) => Promise<void>;
  let { value, selected } = initialQuestionAnswer(prompt);
</script>

<div class="question-heading"><h2>{prompt.question.label.replace(' (Space toggles, Enter confirms)', '')}</h2>{#if prompt.phase === 'permission-intent'}<span class="phase-tag">PERMISSION PREVIEW</span>{/if}</div>
{#if prompt.question.kind === 'boolean'}
  <div class="segmented" role="group" aria-label={prompt.question.label}><button class:selected={value === 'yes' || value === 'true'} aria-pressed={value === 'yes' || value === 'true'} onclick={() => value = 'yes'} disabled={!controller}>Yes</button><button class:selected={value === 'no' || value === 'false'} aria-pressed={value === 'no' || value === 'false'} onclick={() => value = 'no'} disabled={!controller}>No</button></div>
{:else if prompt.question.kind === 'choice'}
  <select id="answer" aria-label={prompt.question.label} bind:value disabled={!controller}>{#each prompt.question.choices ?? [] as option}<option value={option}>{option}</option>{/each}</select>
{:else if prompt.question.kind === 'multi-select' || prompt.question.kind === 'scope-overrides'}
  <div class="check-grid" role="group" aria-label={prompt.question.label}>{#each (prompt.question.kind === 'multi-select' ? prompt.question.choices ?? [] : prompt.question.allowedNames ?? []) as option}<label class="check-option"><input type="checkbox" checked={selected.includes(option)} onchange={() => selected = toggleSelection(selected, option)} disabled={!controller} /><span>{option}</span></label>{/each}</div>
{:else}
  <input id="answer" aria-label={prompt.question.label} type={prompt.question.kind === 'number' ? 'number' : 'text'} min={prompt.question.kind === 'number' ? 0 : undefined} bind:value disabled={!controller} autocomplete="off" />
{/if}
<p class="field-help">Suggested answer: {String(prompt.question.defaultValue) || 'none'} · You can review choices again before creating your setup PAT.</p>
<ActionButton label="Continue" arrow onClick={() => onSubmit(submittedQuestionAnswer(prompt, value, selected))} disabled={!controller || busy} />
