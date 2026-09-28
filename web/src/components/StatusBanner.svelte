<script lang="ts">
  import { safeGithubLink } from '../lib/githubLink';
  import ActionButton from './ActionButton.svelte';
  export let tone: 'info' | 'success' | 'warning' | 'error' = 'info';
  export let title: string;
  export let message: string;
  export let link: string | undefined = undefined;
  export let actionLabel: string | undefined = undefined;
  export let onAction: (() => void | Promise<void>) | undefined = undefined;
  $: githubLink = safeGithubLink(link);
</script>

<div class="banner {tone}" role={tone === 'error' ? 'alert' : 'status'}>
  <strong>{title}</strong><p>{message}</p>
  {#if githubLink}<a href={githubLink} target="_blank" rel="noopener noreferrer">Open GitHub link ↗</a>{/if}
  {#if actionLabel && onAction}<ActionButton label={actionLabel} variant="secondary" onClick={onAction} />{/if}
</div>
