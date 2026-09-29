<script lang="ts">
  import type { SetupProjectCandidate } from '../../../src/application/contracts/web_setup_view';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  import { safeGithubProjectLink } from '../lib/githubLink';
  import { toggleSelection } from '../lib/questionAnswer';
  export let candidates: readonly SetupProjectCandidate[];
  export let selected: string[];
  export let value: string;
  export let controller: boolean;
  $: known = new Set(candidates.map(candidate => String(candidate.number)));
  $: noLongerListed = selected.filter(number => !known.has(number));
</script>

<div class="check-grid producer-grid" role="group" aria-label={tr('projectsObserved', $setupLocale)}>
  {#each candidates as candidate}
    <div class="check-option producer-option">
      <label><input type="checkbox" checked={selected.includes(String(candidate.number))}
        onchange={() => selected = toggleSelection(selected, String(candidate.number))}
        disabled={!controller || (selected.length >= 10 && !selected.includes(String(candidate.number)))} />
        <span><strong><bdi>{candidate.title}</bdi></strong><small><bdi>{candidate.owner} · #{candidate.number}</bdi></small></span>
      </label>
      {#if safeGithubProjectLink(candidate.url)}<a href={safeGithubProjectLink(candidate.url)} target="_blank" rel="noopener noreferrer">{tr('projectUrl', $setupLocale)}</a>{/if}
    </div>
  {/each}
</div>
{#if noLongerListed.length}
  <p class="field-help">{tr('projectSelectionNotObserved', $setupLocale)}</p>
  <ul>{#each noLongerListed as number}<li><bdi>#{number}</bdi> <button type="button" onclick={() => selected = toggleSelection(selected, number)} disabled={!controller}>{tr('removeSelection', $setupLocale)}</button></li>{/each}</ul>
{/if}
<label for="manual-project">{tr('projectManual', $setupLocale)}</label>
<input id="manual-project" type="text" bind:value disabled={!controller} autocomplete="off" />
