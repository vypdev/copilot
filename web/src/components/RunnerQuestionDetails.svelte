<script lang="ts">
  import type { SetupQuestion } from '../../../src/application/contracts/web_setup_view';
  import { runnerText } from '../i18n/runnerCopy';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  export let question: SetupQuestion;
</script>
{#if question.id.startsWith('runners.') && question.id !== 'runners.discover'}
  <section class="runner-details">
    <p>{runnerText('help', $setupLocale)}</p>
    <p role="status">{runnerText('registry', $setupLocale)}: {runnerText(question.runnerRegistryStatus ?? 'unavailable', $setupLocale)}{#if question.runnerRegistryScope} ({tr(question.runnerRegistryScope === 'repository' ? 'scopeRepository' : 'scopeOrganization', $setupLocale)}){/if} · {runnerText('inventory', $setupLocale)}: {runnerText(question.runnerInventory?.status ?? 'unavailable', $setupLocale)}</p>
    {#if question.runnerProfiles?.length}<details open><summary>{runnerText('profiles', $setupLocale)}</summary>
      <ul>{#each question.runnerProfiles as profile}<li><bdi>{profile.id}</bdi>: <code>{profile.group || '—'} · {profile.labels.join(', ')}</code></li>{/each}</ul>
    </details>{/if}
    {#if question.runnerInventory}<details><summary>{runnerText('observed', $setupLocale)}</summary>
      <ul>{#each question.runnerInventory.groups as group}<li><bdi>{group.name}</bdi>: {runnerText(group.access, $setupLocale)}</li>{/each}</ul>
      <ul>{#each question.runnerInventory.candidates.slice(0, 10) as candidate}<li><code>{candidate.labels.join(', ')}</code></li>{/each}</ul>
      {#if question.runnerInventory.candidates.length > 10}<p>{runnerText('limited', $setupLocale)}</p>{/if}
    </details>{/if}
  </section>
{/if}
<style>code, bdi { overflow-wrap: anywhere; } .runner-details { margin-block: 1rem; }</style>
