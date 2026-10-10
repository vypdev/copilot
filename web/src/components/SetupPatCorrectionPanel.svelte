<script lang="ts">
  import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  export let correction: NonNullable<WebSetupView['setupPatCorrection']>;
</script>

<section class="result-facts" aria-label={tr('updatedSetupPatTitle', $setupLocale)}>
  <h3>{tr('updatedSetupPatTitle', $setupLocale)}</h3>
  <p>{tr('updatedSetupPatBody', $setupLocale)}</p>
  {#if correction.stage === 'final' && correction.addedGrants.length}
    <p><strong>{tr('updatedSetupPatGrants', $setupLocale)}:</strong></p>
    <ul>{#each correction.addedGrants as grant}<li><bdi>{grant}</bdi></li>{/each}</ul>
  {/if}
  <a href={correction.url} target="_blank" rel="noopener noreferrer">{tr('updatedSetupPatLink', $setupLocale)} ↗</a>
</section>
