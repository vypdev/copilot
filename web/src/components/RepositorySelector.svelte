<script lang="ts">
  import type { SetupBatchSelectionView } from '../../../src/application/contracts/web_setup_view';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  export let selection: SetupBatchSelectionView;
  export let controller: boolean;
  export let busy: boolean;
  export let onSubmit: (value: string) => Promise<void>;
  let selected = [...selection.selectedIds];
  let query = '';
  let exactName = '';
  let page = 0;
  $: matching = selection.candidates.filter(candidate => candidate.name.toLowerCase().includes(query.toLowerCase()));
  $: shown = matching.slice(page * 25, (page + 1) * 25);
  $: hasUnavailableSelection = selected.some(id => !selection.candidates.some(candidate => candidate.id === id && !candidate.unavailable));
  $: if (page > 0 && page * 25 >= matching.length) page = 0;
  function toggle(id: number): void { selected = selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id]; }
  function send(action: 'select' | 'resolve' | 'access'): void {
    void onSubmit(JSON.stringify({ action, selectedIds: selected, ...(action === 'resolve' ? { name: exactName.trim() } : {}) }));
  }
</script>

<p>{tr('batchSelectionBody', $setupLocale, { organization: selection.organization })}</p>
{#if selection.discoveryStatus === 'unavailable'}<p class="banner warning" role="status">{tr('batchDiscoveryUnavailable', $setupLocale)}</p>{/if}
{#if selection.message}<p class="banner warning" role="status">{tr(selection.message === 'lookup-unavailable' ? 'batchLookupUnavailable' : selection.message === 'selection-invalid' ? 'batchSelectionInvalid' : 'batchAccessUnavailable', $setupLocale)}</p>{/if}
{#if selection.truncated}<p class="banner warning" role="status">{tr('batchDiscoveryTruncated', $setupLocale)}</p>{/if}
<label for="repository-filter">{tr('batchFilter', $setupLocale)}</label>
<input id="repository-filter" type="search" bind:value={query} oninput={() => page = 0} disabled={!controller || busy} />
<p role="status">{tr('batchSelectedCount', $setupLocale, { count: String(selected.length) })}</p>
<fieldset disabled={!controller || busy}>
  <legend>{tr('batchRepositories', $setupLocale)}</legend>
  <div class="repository-list">
    {#each shown as candidate (candidate.id)}
      <label class="repository-row">
        <input type="checkbox" checked={selected.includes(candidate.id)} disabled={!selected.includes(candidate.id) && (Boolean(candidate.unavailable) || selected.length >= 25)}
          onchange={() => toggle(candidate.id)} />
        <span><strong>{candidate.name}</strong><small>{tr(candidate.private ? 'batchPrivate' : 'batchPublic', $setupLocale)}
          {#if candidate.id === selection.currentRepositoryId} · {tr('batchCurrent', $setupLocale)}{/if}
          {#if candidate.unavailable} · {tr(candidate.unavailable === 'archived' ? 'batchArchived' : candidate.unavailable === 'disabled' ? 'batchDisabled' : candidate.unavailable === 'access-unavailable' ? 'batchAccessUnavailable' : 'batchReadOnly', $setupLocale)}{/if}
        </small></span>
      </label>
    {/each}
  </div>
</fieldset>
{#if !matching.length}<p>{tr('batchNoMatches', $setupLocale)}</p>{/if}
{#if matching.length > 25}<div class="batch-actions">
  <button class="secondary-button" onclick={() => page -= 1} disabled={page === 0 || !controller || busy}>{tr('batchPrevious', $setupLocale)}</button>
  <span>{page + 1} / {Math.ceil(matching.length / 25)}</span>
  <button class="secondary-button" onclick={() => page += 1} disabled={(page + 1) * 25 >= matching.length || !controller || busy}>{tr('batchNext', $setupLocale)}</button>
</div>{/if}
<details><summary>{tr('batchMissingRepository', $setupLocale)}</summary>
  <p>{tr('batchAccessExplanation', $setupLocale)}</p>
  <label for="repository-exact-name">{tr('batchExactName', $setupLocale)}</label>
  <input id="repository-exact-name" bind:value={exactName} maxlength="100" placeholder="service-api" disabled={!controller || busy} />
  <div class="batch-actions">
    <button class="secondary-button" onclick={() => send('resolve')} disabled={!controller || busy || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/.test(exactName.trim())}>{tr('batchFindRepository', $setupLocale)}</button>
    <button class="secondary-button" onclick={() => send('access')} disabled={!controller || busy}>{tr('batchChangeAccess', $setupLocale)}</button>
  </div>
</details>
<button class="primary" onclick={() => send('select')} disabled={!controller || busy || hasUnavailableSelection || selected.length < 1 || selected.length > 25}>{tr('batchReviewSelection', $setupLocale)}</button>

<style>
  fieldset { border: 0; padding: 0; margin: 1rem 0; min-width: 0; }
  legend { font-weight: 600; margin-bottom: .5rem; }
  .repository-list { display: grid; gap: .5rem; }
  .repository-row { display: flex; align-items: start; gap: .75rem; padding: .75rem; border: 1px solid var(--line); border-radius: .75rem; }
  .repository-row input { width: auto; margin-top: .25rem; flex: none; }
  .repository-row span { min-width: 0; overflow-wrap: anywhere; }
  .repository-row small { display: block; margin-top: .25rem; }
  .batch-actions { display: flex; gap: .5rem; flex-wrap: wrap; align-items: center; margin: .75rem 0; }
  details { margin: 1rem 0; }
</style>
