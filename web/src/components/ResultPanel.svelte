<script lang="ts">
  import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
  import ActionButton from './ActionButton.svelte';
  export let outcome: NonNullable<WebSetupView['outcome']>;
  export let controller: boolean;
  export let onClose: () => Promise<void>;
  $: heading = outcome === 'complete' ? 'Your configuration was applied'
    : outcome === 'dry-run' ? 'No changes were made'
    : outcome === 'cancelled' || outcome === 'blocked' ? 'No setup changes started'
    : 'Check partial changes before retrying';
  $: explanation = outcome === 'complete'
    ? 'The temporary setup PAT is not revoked automatically. Delete it in GitHub after confirming your setup. Keep the bot PAT until you rotate the installed Secret.'
    : outcome === 'partial'
      ? 'A bot Secret write or another change may have succeeded. Inspect GitHub and run copilot doctor before replacing or deleting its PAT.'
      : 'Copilot did not begin applying setup changes. PATs you created in GitHub still exist until you delete them there.';
</script>

<section class="card result-card"><span class="result-icon" aria-hidden="true">{outcome === 'complete' ? '✓' : '!'}</span><h2>{heading}</h2><p>{explanation}</p><div class="result-links"><a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer">Open GitHub PAT settings ↗</a><code>copilot doctor</code></div>{#if controller}<ActionButton label="Close local session" onClick={onClose} />{/if}</section>
